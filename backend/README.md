# backend

Mosquitto ve TimescaleDB.

`.env.example` dosyasını `.env` yap, şifreyi yaz, sonra:

```bash
docker compose up -d
```

MQTT `1883`, veritabanı `5432`. Anonim bağlantı kapalı.

`timescale/init/` altındaki scriptler sadece volume boşken çalışır. Şema değişince:

```bash
docker compose down -v
docker compose up -d
```
