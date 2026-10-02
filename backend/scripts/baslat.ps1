$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $PSScriptRoot
Set-Location $backend
docker compose up -d --wait
docker compose ps
Write-Host ""
& "$PSScriptRoot\baglanti-bilgisi.ps1"
