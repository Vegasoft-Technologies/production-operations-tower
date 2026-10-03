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
NEŞE — Hafta 1 bağlantı

Kendi bilgisayarın (MQTT Explorer profili: OEE Broker, DBeaver)
- MQTT host: localhost
- MQTT port: 1883
- DB host: localhost
- DB port: 5432

Ekip (Tailscale)
- Adres: ${IP}
- MQTT port: 1883
- DB port: 5432

Ortak hesap
- MQTT kullanıcı: ${USER}
- MQTT şifre: ${PASS}
- Veritabanı: ${DB}
- DB kullanıcı: ${DB_USER}
- DB şifre: ${DB_PASS}
- Test topic: ekip/hafta1/test
- Mesaj: Neşe
- Anonim bağlantı: kapalı

Tablolar: machines, telemetry
  COUNTER1        -> telemetry.counter
  REJECT_COUNTER  -> telemetry.reject_counter
  STATUS_BIT      -> telemetry.status_bit
  makine          -> hat-1
EOF
