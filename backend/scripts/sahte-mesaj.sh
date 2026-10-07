#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

TOPIC="Factory_1/Production_Line_1/Machine_1/data"

if [ "${1:-}" = "--bozuk" ]; then
  BODY="bu-json-degil"
else
  TS="$(date +%s)000"
  BODY="{\"factory\":\"Factory_1\",\"line\":\"Production_Line_1\",\"machine\":\"Machine_1\",\"ts\":${TS},\"status\":true,\"total_count\":1234,\"reject_count\":61}"
fi

docker run --rm eclipse-mosquitto:2.0.22 mosquitto_pub \
  -h host.docker.internal -p 1883 \
  -u "${MQTT_USERNAME:?}" -P "${MQTT_PASSWORD:?}" \
  -t "$TOPIC" -m "$BODY"
echo "gonderildi"
