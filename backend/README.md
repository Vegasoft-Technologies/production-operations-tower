# backend

Mosquitto, TimescaleDB ve SSE servisi.

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

SSE servisi:

```bash
py -3 -m pip install -r requirements.txt
py -3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Tarayıcıda `http://127.0.0.1:8000/stream`. Ekip bu adrese Tailscale IP'si ile bağlanır. Şifre, IP ve `.env` GitHub'a girmez.

Yağmur hazır değilken sahte mesaj:

```powershell
.\scripts\sahte-mesaj.ps1
```

Bozuk mesaj servisi düşürmez:

```powershell
.\scripts\sahte-mesaj.ps1 -Bozuk
```

Topic: `Factory_1/Production_Line_1/Machine_1/data`
