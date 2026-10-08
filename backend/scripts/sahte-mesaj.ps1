param([switch]$Bozuk)

$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $PSScriptRoot
Set-Location $backend

Get-Content (Join-Path $backend ".env") -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_.Split('=', 2)
  Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
}

if ($Bozuk) {
  $body = "bu-json-degil"
} else {
  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $body = "{""factory"":""Factory_1"",""line"":""Production_Line_1"",""machine"":""Machine_1"",""ts"":$ts,""status"":true,""total_count"":1234,""reject_count"":61}"
}

$body | docker run --rm -i eclipse-mosquitto:2.0.22 mosquitto_pub -h host.docker.internal -p 1883 -u $env:MQTT_USERNAME -P $env:MQTT_PASSWORD -t "Factory_1/Production_Line_1/Machine_1/data" -s
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "gonderildi"
