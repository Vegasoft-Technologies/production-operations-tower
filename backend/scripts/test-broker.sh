#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

HOST="${MQTT_HOST:-127.0.0.1}"
PORT="${MQTT_PORT:-1883}"
USER="${MQTT_USERNAME:?}"
PASS="${MQTT_PASSWORD:?}"
TOPIC="ekip/hafta1/test"
PAYLOAD="Neşe: broker ayakta"

if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="sudo docker"
fi

pub() {
  $DOCKER run --rm --network host eclipse-mosquitto:2.0.22 \
    mosquitto_pub -h "$HOST" -p "$PORT" "$@"
}

echo "== doğru şifre =="
OUT="$(mktemp)"
$DOCKER run --rm --network host eclipse-mosquitto:2.0.22 \
  mosquitto_sub -h "$HOST" -p "$PORT" -u "$USER" -P "$PASS" -t "$TOPIC" -C 1 -W 8 >"$OUT" &
SUB=$!
sleep 1
pub -u "$USER" -P "$PASS" -t "$TOPIC" -m "$PAYLOAD"
wait "$SUB"
GOT="$(cat "$OUT")"
rm -f "$OUT"
if [ "$GOT" != "$PAYLOAD" ]; then
  echo "HATA: beklenen mesaj gelmedi: $GOT" >&2
  exit 1
fi
echo "doğru şifre kabul edildi, mesaj alındı: $GOT"

echo "== yanlış şifre =="
if pub -u "$USER" -P "yanlis-sifre" -t "$TOPIC" -m "olmamali"; then
  echo "HATA: yanlış şifre kabul edildi" >&2
  exit 1
fi
echo "yanlış şifre reddedildi"

echo "== anonim =="
if pub -t "$TOPIC" -m "anonim-olmamali"; then
  echo "HATA: anonim bağlantı kabul edildi" >&2
  exit 1
fi
echo "anonim bağlantı reddedildi"

echo "broker testleri geçti"
