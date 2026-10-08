#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

USER="${TIMESCALE_USER:?}"
PASS="${TIMESCALE_PASSWORD:?}"
DB="${TIMESCALE_DB:?}"
HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-5432}"

if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="sudo docker"
fi

HT=$($DOCKER run --rm --network host \
  -e PGPASSWORD="$PASS" \
  timescale/timescaledb:2.21.3-pg16 \
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -tAc \
  "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'telemetry';")
[ "$HT" = "1" ] || { echo "HATA: telemetry hypertable bulunamadı" >&2; exit 1; }

COL=$($DOCKER run --rm --network host \
  -e PGPASSWORD="$PASS" \
  timescale/timescaledb:2.21.3-pg16 \
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -tAc \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'telemetry' AND column_name IN ('total_count', 'reject_count', 'status');")
[ "$COL" = "3" ] || { echo "şema değişti, docker compose down -v yapın" >&2; exit 1; }

FAC=$($DOCKER run --rm --network host \
  -e PGPASSWORD="$PASS" \
  timescale/timescaledb:2.21.3-pg16 \
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -tAc \
  "SELECT count(*) FROM machines WHERE id = 'Machine_1' AND factory = 'Factory_1' AND line = 'Production_Line_1';")
[ "$FAC" = "1" ] || { echo "şema değişti, docker compose down -v yapın" >&2; exit 1; }

echo "veritabanı dışarıdan erişildi, telemetry hypertable duruyor"
