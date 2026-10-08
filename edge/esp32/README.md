# ESP32 – OpenPLC → MQTT köprüsü (Hafta 2)

Wokwi for VS Code'da simüle edilen ESP32, OpenPLC'yi Modbus TCP ile okur ve veri sözleşmesindeki JSON'u her saniye MQTT broker'a yayınlar.

```
OpenPLC (v3, localhost:502) --Modbus TCP--> ESP32 (Wokwi) --MQTT--> Broker --> Backend --> Dashboard
```

## Yayınlanan veri

Topic: `Factory_1/Production_Line_1/Machine_1/data`, her 1 saniyede bir.

```json
{
  "factory": "Factory_1",
  "line": "Production_Line_1",
  "machine": "Machine_1",
  "ts": 1760180400000,
  "status": true,
  "total_count": 1234,
  "reject_count": 61
}
```

| Alan | Kaynak | Açıklama |
|---|---|---|
| ts | NTP (UTC) | Unix zamanı, milisaniye |
| status | Coil 0 (%QX0.0) | true = makine çalışıyor |
| total_count | HR0 (%QW0) | Toplam üretim (hatalılar dahil) |
| reject_count | HR1 (%QW1) | Hatalı üretim |

Kurallar:

- Modbus okuması başarısız olursa o saniye mesaj gönderilmez; eski değer tekrar gönderilmez.
- NTP saati alınamadıysa da mesaj gönderilmez.
- ESP32 saati 15 saniyede bir NTP'den yenilenir. Wokwi simülasyonu gerçek zamandan yavaş çalışabildiği ve sekme arka plandayken duraklayabildiği için, yalnızca açılışta alınan saat dakikalar içinde geride kalıyordu.
- Sayaçlar 32767'den sonra 0'a döner, PLC yeniden başlayınca 0'dan başlar. Artış hesabı backend'in işidir (bkz. veri sözleşmesi).

## Klasör yapısı

```
platformio.ini          Derleme ayarları (esp32dev, PubSubClient)
wokwi.toml              Wokwi'nin çalıştıracağı firmware yolu
diagram.json            Devre: sadece ESP32 (elle düzenlenir)
src/main.cpp            Modbus okuma + JSON + MQTT yayını
include/secrets.h.example  Broker bilgileri için örnek dosya
include/secrets.h       Gerçek bilgiler (.gitignore'da, repoya girmez)
```

## Kurulum

1. VS Code'a **PlatformIO IDE** ve **Wokwi Simulator** eklentilerini kur.
2. **F1 → Wokwi: Request a New License** ile ücretsiz Community lisansını al (30 gün, yenilenebilir).
3. `include/secrets.h.example` dosyasını `include/secrets.h` adıyla kopyala ve broker bilgilerini doldur.
4. VS Code'da **File → Open Folder** ile `edge/esp32` klasörünü aç.

## Çalıştırma

1. OpenPLC v3 çalışıyor olmalı (`wsl`, localhost:8080'de **Running**, Modbus Server açık).
2. Alt çubuktaki **✓ (Build)** ile derle.
3. **F1 → Wokwi: Start Simulator**. Simülatör sekmesi görünür kalmalı, aksi hâlde simülasyon duraklayabilir.
4. Wokwi Terminal'de her saniye `[PUB] {...}` satırı görünmeli.

ESP32, bilgisayara `host.wokwi.internal` adresiyle ulaşır (Wokwi'nin VS Code eklentisindeki yerleşik Private Gateway). Güvenlik Duvarı'nda 502 portunu açmak gerekmedi.

## Yerel test (ekip broker'ı kapalıyken)

1. Bilgisayara Mosquitto kur: `winget install EclipseFoundation.Mosquitto` (Windows servisi olarak çalışır).
2. `secrets.h` içinde `MQTT_HOST` değerini `"host.wokwi.internal"` yap.
3. MQTT Explorer'da `localhost:1883` (kullanıcı adı/şifre boş) ile bağlan.

## Ekip broker'ına bağlantı (yerel köprü)

Wokwi'den ekip broker'ına (Tailscale adresi) doğrudan bağlanınca bağlantı kuruluyor ama sonraki paketler yolda kayboluyordu. Bu yüzden ESP32 bilgisayardaki Mosquitto'ya yazar, Mosquitto da mesajları köprü olarak ekip broker'ına iletir:

```
ESP32 (Wokwi) --> host.wokwi.internal:1883 (yerel Mosquitto) --bridge, Tailscale--> ekip broker'ı
```

1. Yönetici PowerShell'de `C:\Program Files\mosquitto\mosquitto.conf` dosyasının sonuna ekle:
   ```
   listener 1883 127.0.0.1
   allow_anonymous true

   connection nese
   address <broker-tailscale-ip>:1883
   remote_username <kullanici>
   remote_password <sifre>
   topic Factory_1/# out 0
   keepalive_interval 15
   restart_timeout 2 10
   ```
2. `Restart-Service mosquitto`
3. `secrets.h` içinde `MQTT_HOST` = `"host.wokwi.internal"`.
4. Köprünün durumu: yerel broker'da `$SYS/broker/connection/<bilgisayar>.nese/state` (1 = bağlı).

Not: İki bilgisayar arasında Tailscale doğrudan bağlantı kuramadı (`tailscale ping` → `via DERP`), trafik aracı sunucudan geçiyor. Bağlantı ara ara kopabiliyor; `keepalive_interval` ve `restart_timeout` ile köprü birkaç saniyede kendiliğinden yeniden bağlanır.

## Güvenlik

- Broker şifresi yalnızca `include/secrets.h` ve yerel `mosquitto.conf` içinde durur; ikisi de repoya girmez.
- Yerel Mosquitto yalnızca `127.0.0.1`'i dinler, ağdan erişilemez.
- Modbus TCP'de kimlik doğrulama yoktur; OpenPLC ortak ağa açılmamalıdır.
- Wokwi for VS Code ücretsiz lisansı açık kaynak projeler içindir; ticari kullanım için ücretli lisans gerekir.
