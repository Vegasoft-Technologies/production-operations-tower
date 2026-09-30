#!/bin/sh
set -eu

if [ -z "${MQTT_USERNAME:-}" ] || [ -z "${MQTT_PASSWORD:-}" ]; then
  echo "MQTT_USERNAME and MQTT_PASSWORD are required" >&2
  exit 1
fi

mkdir -p /mosquitto/data /mosquitto/log
mosquitto_passwd -b -c /mosquitto/data/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
chown -R mosquitto:mosquitto /mosquitto/data /mosquitto/log
chmod 700 /mosquitto/data /mosquitto/log
chmod 600 /mosquitto/data/passwd

exec su mosquitto -s /bin/sh -c 'exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf'
