# ToolsAI Control Center — ensure bridge is up, then open the tools home (orbit).
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$urlHome = 'http://127.0.0.1:5173/'
$port = 5173

function Test-Endpoint([string]$Uri) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $Uri
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Test-BridgeHealthy {
  # Fast gate: home page + launch bridge + promo pipeline API (detect stale dev server).
  if (-not (Test-Endpoint $urlHome)) { return $false }
  if (-not (Test-Endpoint 'http://127.0.0.1:5173/api/runtime-status')) { return $false }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri 'http://127.0.0.1:5173/api/pipeline'
    $ct = $r.Headers['Content-Type']
    if ($ct -notlike '*application/json*') { return $false }
    $j = $r.Content | ConvertFrom-Json
    return ($j.ok -eq $true)
  } catch {
    return $false
  }
}

function Invoke-FreshLaunchSession {
  # Best-effort: reset Outreach run when opening from the desktop launcher.
  # Runs after the browser opens so it never blocks first paint.
  $uris = @(
    'http://127.0.0.1:5173/api/outreach?action=fresh-launch',
    'http://127.0.0.1:5173/api/outreach?action=clear-run'
  )
  foreach ($uri in $uris) {
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Method POST `
        -Uri $uri -ContentType 'application/json' -Body '{}' | Out-Null
      Write-Host 'Session reset — starting fresh (profiles kept).'
      return
    } catch {}
  }
}

function Open-ControlCenter {
  Write-Host 'Opening tools home…'
  Start-Process $urlHome
  # Non-blocking for the user: reset after the tab is already opening
  Invoke-FreshLaunchSession
}

function Stop-PortListener([int]$ListenPort) {
  $pids = @()
  try {
    $pids = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  } catch {}
  if (-not $pids -or $pids.Count -eq 0) {
    $lines = netstat -ano | Select-String ":$ListenPort\s+.*LISTENING"
    foreach ($line in $lines) {
      $parts = ($line.ToString() -split '\s+') | Where-Object { $_ -ne '' }
      if ($parts.Count -ge 5) {
        $pidVal = [int]$parts[-1]
        if ($pidVal -gt 0) { $pids += $pidVal }
      }
    }
    $pids = $pids | Select-Object -Unique
  }
  foreach ($procId in $pids) {
    if ($procId -and $procId -gt 0) {
      Write-Host "Stopping stale process on :$ListenPort (PID $procId)…"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 600
}

if (Test-BridgeHealthy) {
  Write-Host 'ToolsAI bridge already healthy.'
  Open-ControlCenter
  exit 0
}

# Home up but bridge API missing → force restart
if (Test-Endpoint $urlHome) {
  Write-Host 'Bridge is stale (API missing). Restarting…'
  Stop-PortListener $port
}

Write-Host 'Starting ToolsAI Control Center…'
$npmCmd = 'npm'
$npmInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmInfo -and $npmInfo.Source) { $npmCmd = $npmInfo.Source }

$proc = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', "title ToolsAI Control Center && `"$npmCmd`" run dev" `
  -WorkingDirectory $root `
  -WindowStyle Minimized `
  -PassThru

if ($proc) { Write-Host "Dev server PID $($proc.Id)" }

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-BridgeHealthy) {
    Write-Host 'Bridge ready.'
    Open-ControlCenter
    exit 0
  }
  Start-Sleep -Milliseconds 400
}

Write-Host 'Timed out waiting for bridge. Opening anyway…'
Start-Process $urlHome
exit 1
