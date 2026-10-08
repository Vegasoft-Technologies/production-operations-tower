#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

IP=""
if command -v tailscale >/dev/null 2>&1; then
  IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
fi
if [ -z "$IP" ]; then
  IP="<tailscale ip -4 çıktısı>"
fi

USER="${MQTT_USERNAME:-}"
PASS="${MQTT_PASSWORD:-}"
DB_USER="${TIMESCALE_USER:-}"
DB_PASS="${TIMESCALE_PASSWORD:-}"
DB="${TIMESCALE_DB:-}"

cat <<EOF
NEŞE — bağlantı

Kendi bilgisayarın (MQTT Explorer profili: OEE Broker, DBeaver)
- MQTT host: localhost
- MQTT port: 1883
- DB host: localhost
- DB port: 5432
- SSE: http://127.0.0.1:8000/stream

Ekip (Tailscale)
- Adres: ${IP}
- MQTT port: 1883
- DB port: 5432
- SSE: http://${IP}:8000/stream

Ortak hesap
- MQTT kullanıcı: ${USER}
- MQTT şifre: ${PASS}
- Veritabanı: ${DB}
- DB kullanıcı: ${DB_USER}
- DB şifre: ${DB_PASS}
- Topic: Factory_1/Production_Line_1/Machine_1/data
- Anonim bağlantı: kapalı

Tablolar: machines, telemetry
  total_count   -> telemetry.total_count
  reject_count  -> telemetry.reject_count
  status        -> telemetry.status
  makine        -> Machine_1
  hat           -> Production_Line_1
  fabrika       -> Factory_1
EOF
