$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $PSScriptRoot
Set-Location $backend

Get-Content (Join-Path $backend ".env") -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_.Split('=', 2)
  Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
}

$candidates = @(
  "$env:ProgramFiles\Tailscale\tailscale.exe",
  "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe"
)
$tailscale = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $tailscale) {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { $tailscale = $cmd.Source }
}

$ip = "<tailscale ip -4 çıktısı>"
if ($tailscale) {
  $found = & $tailscale ip -4 2>$null | Select-Object -First 1
  if ($found) { $ip = $found.Trim() }
}

@"
NEŞE — Hafta 1 bağlantı

Kendi bilgisayarın (MQTT Explorer profili: OEE Broker, DBeaver)
- MQTT host: localhost
- MQTT port: 1883
- DB host: localhost
- DB port: 5432

Ekip (Tailscale)
- Adres: $ip
- MQTT port: 1883
- DB port: 5432

Ortak hesap
- MQTT kullanıcı: $($env:MQTT_USERNAME)
- MQTT şifre: $($env:MQTT_PASSWORD)
- Veritabanı: $($env:TIMESCALE_DB)
- DB kullanıcı: $($env:TIMESCALE_USER)
- DB şifre: $($env:TIMESCALE_PASSWORD)
- Test topic: ekip/hafta1/test
- Mesaj: Neşe
- Anonim bağlantı: kapalı

Tablolar: machines, telemetry
  COUNTER1   -> telemetry.counter
  hatalı parça -> telemetry.reject_counter
  STATUS_BIT -> telemetry.status_bit
  makine     -> hat-1
"@
