# Builds GPU-fixed + fast UGC Ollama models (skips if already present).
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Has-Model([string]$name) {
  $list = & ollama list 2>$null | Out-String
  return $list -match [regex]::Escape($name)
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Warning 'ollama not on PATH'
  exit 0
}

if (-not (Has-Model 'ugc-lt-fast')) {
  Write-Host 'Creating ugc-lt-fast (llama3.1:8b, 100% GPU)...'
  & ollama create ugc-lt-fast -f (Join-Path $Root 'ollama\Modelfile.ugc-lt-fast')
} else {
  Write-Host 'ugc-lt-fast already installed'
}

if (-not (Has-Model 'ugc-lt-gpu')) {
  Write-Host 'Creating ugc-lt-gpu (OpenEuroLLM num_gpu=32, ctx=5000 for 8GB)...'
  & ollama create ugc-lt-gpu -f (Join-Path $Root 'ollama\Modelfile.ugc-lt-gpu')
} else {
  Write-Host 'ugc-lt-gpu already installed'
}
