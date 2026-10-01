# ToolsAI Control Center — regenerate app icon ICO and refresh desktop shortcut.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
Set-Location $root

$pngPath = Join-Path $root 'public\app-icon.png'
$icoPath = Join-Path $root 'toolsai-app.ico'
$legacyIcoPath = Join-Path $root 'toolsai.ico'
$batPath = Join-Path $root 'Start ToolsAI.bat'
$electronExe = Join-Path $root 'node_modules\electron\dist\electron.exe'
$shortcutName = 'ToolsAI Control Center.lnk'

# Legacy / duplicate shortcut names to remove from every desktop folder.
$staleShortcutNames = @(
    'ToolsAI Control Center.lnk',
    'ToolsAI.lnk',
    'ToolsAI Control Center (1).lnk',
    'ToolsAI Control Center (2).lnk'
)

function Convert-PngToIco {
    param(
        [string]$SourcePng,
        [string]$DestIco,
        [int[]]$Sizes = @(16, 32, 48, 64, 128, 256)
    )

    if (-not (Test-Path $SourcePng)) {
        throw "Missing logo PNG: $SourcePng"
    }

    Add-Type -AssemblyName System.Drawing

    $src = [System.Drawing.Image]::FromFile($SourcePng)
    # Trim baked-in margins (~632x678 content centered in 1024² PNG) — matches AppLogo LOGO_BLEED_SCALE.
    $cropX = [int]($src.Width * 0.191)
    $cropY = [int]($src.Height * 0.160)
    $cropW = [int]($src.Width * 0.618)
    $cropH = [int]($src.Height * 0.662)
    $bitmaps = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
    foreach ($size in $Sizes) {
        $bmp = New-Object System.Drawing.Bitmap $size, $size
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.DrawImage(
            $src,
            (New-Object System.Drawing.Rectangle 0, 0, $size, $size),
            $cropX,
            $cropY,
            $cropW,
            $cropH,
            [System.Drawing.GraphicsUnit]::Pixel
        )
        $graphics.Dispose()
        $bitmaps.Add($bmp)
    }
    $src.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter $ms

    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]$bitmaps.Count)

    $offset = 6 + 16 * $bitmaps.Count
    $imageData = New-Object System.Collections.Generic.List[byte[]]
    foreach ($bmp in $bitmaps) {
        $imageStream = New-Object System.IO.MemoryStream
        $bmp.Save($imageStream, [System.Drawing.Imaging.ImageFormat]::Png)
        $data = $imageStream.ToArray()
        $imageStream.Close()
        $imageData.Add($data)

        $bw.Write([Byte]($bmp.Width -band 0xFF))
        $bw.Write([Byte]($bmp.Height -band 0xFF))
        $bw.Write([Byte]0)
        $bw.Write([Byte]0)
        $bw.Write([UInt16]1)
        $bw.Write([UInt16]32)
        $bw.Write([UInt32]$data.Length)
        $bw.Write([UInt32]$offset)
        $offset += $data.Length
    }

    foreach ($data in $imageData) {
        $bw.Write($data)
    }

    $bytes = $ms.ToArray()
    $bw.Close()
    $ms.Close()
    foreach ($bmp in $bitmaps) { $bmp.Dispose() }

    [System.IO.File]::WriteAllBytes($DestIco, $bytes)
}

function Get-DesktopPaths {
    $paths = @()
    if ($env:USERPROFILE) {
        $paths += Join-Path $env:USERPROFILE 'Desktop'
        $paths += Join-Path $env:USERPROFILE 'OneDrive\Desktop'
    }
    if ($env:PUBLIC) {
        $paths += Join-Path $env:PUBLIC 'Desktop'
    }

    return $paths |
        Where-Object { Test-Path $_ } |
        ForEach-Object { (Resolve-Path $_).Path } |
        Select-Object -Unique
}

function Get-CanonicalDesktopPath {
    $shellDesktop = [Environment]::GetFolderPath('Desktop')
    if ($shellDesktop -and (Test-Path $shellDesktop)) {
        return (Resolve-Path $shellDesktop).Path
    }

    $paths = Get-DesktopPaths
    if ($paths.Count -gt 0) {
        return $paths[0]
    }

    return $null
}

function Remove-StaleShortcuts {
    param([string[]]$DesktopDirs)

    foreach ($desktop in $DesktopDirs) {
        foreach ($name in $staleShortcutNames) {
            $candidate = Join-Path $desktop $name
            if (Test-Path $candidate) {
                Remove-Item -LiteralPath $candidate -Force
                Write-Host "Removed stale shortcut: $candidate"
            }
        }

        Get-ChildItem -LiteralPath $desktop -Filter 'ToolsAI*.lnk' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne $shortcutName } |
            ForEach-Object {
                Remove-Item -LiteralPath $_.FullName -Force
                Write-Host "Removed extra shortcut: $($_.FullName)"
            }
    }
}

function Notify-ShellIconCacheRefresh {
    if (-not ('Shell32' -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Shell32 {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
    }

    # SHCNE_ASSOCCHANGED — ask Explorer to refresh icon associations.
    [Shell32]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}

function Install-Shortcut {
    param([string]$DesktopDir)

    $linkPath = Join-Path $DesktopDir $shortcutName
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($linkPath)
    # Desktop app (Electron); fall back to the old launcher if Electron is not installed.
    if (Test-Path $electronExe) {
        $shortcut.TargetPath = $electronExe
        $shortcut.Arguments = '"' + $root + '"'
    } else {
        $shortcut.TargetPath = $batPath
    }
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = "$icoPath,0"
    $shortcut.Description = 'ToolsAI Control Center'
    $shortcut.Save()

    $readBack = $shell.CreateShortcut($linkPath)
    return [PSCustomObject]@{
        Path = $linkPath
        IconLocation = $readBack.IconLocation
        TargetPath = $readBack.TargetPath
    }
}

Write-Host "Regenerating $([IO.Path]::GetFileName($icoPath)) from public\app-icon.png…"
Convert-PngToIco -SourcePng $pngPath -DestIco $icoPath

$icoItem = Get-Item $icoPath
Write-Host "Wrote $icoPath ($($icoItem.Length) bytes, $($icoItem.LastWriteTime))"

if (Test-Path $legacyIcoPath) {
    Remove-Item -LiteralPath $legacyIcoPath -Force
    Write-Host "Removed legacy icon cache file: $legacyIcoPath"
}

$allDesktops = Get-DesktopPaths
Remove-StaleShortcuts -DesktopDirs $allDesktops

$canonicalDesktop = Get-CanonicalDesktopPath
if (-not $canonicalDesktop) {
    Write-Warning 'No desktop folder found — icon file updated only.'
    exit 0
}

$installed = Install-Shortcut -DesktopDir $canonicalDesktop
Notify-ShellIconCacheRefresh

Write-Host ''
Write-Host 'Installed shortcut:'
Write-Host "  Path:         $($installed.Path)"
Write-Host "  TargetPath:   $($installed.TargetPath)"
Write-Host "  IconLocation: $($installed.IconLocation)"
Write-Host ''
Write-Host 'If the desktop still shows the old tan/gold diamond icon, clear the Windows icon cache:'
Write-Host '  ie4uinit.exe -show'
Write-Host '  ie4uinit.exe -ClearIconCache'
Write-Host 'Then sign out and back in (or reboot). No need to delete shortcuts manually after this script.'
Write-Host 'Done.'
