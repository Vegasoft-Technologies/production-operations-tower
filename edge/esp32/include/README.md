ESP32 – OpenPLC → MQTT köprüsü (Hafta 2)

Wokwi for VS Code'da simüle edilen ESP32, OpenPLC'yi Modbus TCP ile okur ve veri sözleşmesindeki JSON'u her saniye MQTT broker'a yayınlar.

OpenPLC (v3, localhost:502) --Modbus TCP--> ESP32 (Wokwi) --MQTT--> Broker --> Backend --> Dashboard
Yayınlanan veri

Topic: Factory_1/Production_Line_1/Machine_1/data, her 1 saniyede bir.

json
{
  "factory": "Factory_1",
  "line": "Production_Line_1",
  "machine": "Machine_1",
  "ts": 1760180400000,
  "status": true,
  "total_count": 1234,
  "reject_count": 61
}
Alan	Kaynak	Açıklama
ts	NTP (UTC)	Unix zamanı, milisaniye
status	Coil 0 (%QX0.0)	true = makine çalışıyor
total_count	HR0 (%QW0)	Toplam üretim (hatalılar dahil)
reject_count	HR1 (%QW1)	Hatalı üretim

Kurallar:

Modbus okuması başarısız olursa o saniye mesaj gönderilmez; eski değer tekrar gönderilmez.
NTP saati alınamadıysa da mesaj gönderilmez.
Sayaçlar 32767'den sonra 0'a döner, PLC yeniden başlayınca 0'dan başlar. Artış hesabı backend'in işidir (bkz. veri sözleşmesi).
Klasör yapısı
platformio.ini          Derleme ayarları (esp32dev, PubSubClient)
wokwi.toml              Wokwi'nin çalıştıracağı firmware yolu
diagram.json            Devre: sadece ESP32 (elle düzenlenir)
src/main.cpp            Modbus okuma + JSON + MQTT yayını
include/secrets.h.example  Broker bilgileri için örnek dosya
include/secrets.h       Gerçek bilgiler (.gitignore'da, repoya girmez)
Kurulum
VS Code'a PlatformIO IDE ve Wokwi Simulator eklentilerini kur.
F1 → Wokwi: Request a New License ile ücretsiz Community lisansını al (30 gün, yenilenebilir).
include/secrets.h.example dosyasını include/secrets.h adıyla kopyala ve broker bilgilerini doldur.
VS Code'da File → Open Folder ile edge/esp32 klasörünü aç.
Çalıştırma
OpenPLC v3 çalışıyor olmalı (wsl, localhost:8080'de Running, Modbus Server açık).
Alt çubuktaki ✓ (Build) ile derle.
F1 → Wokwi: Start Simulator. Simülatör sekmesi görünür kalmalı, aksi hâlde simülasyon duraklayabilir.
Wokwi Terminal'de her saniye [PUB] {...} satırı görünmeli.

ESP32, bilgisayara host.wokwi.internal adresiyle ulaşır (Wokwi'nin VS Code eklentisindeki yerleşik Private Gateway). Güvenlik Duvarı'nda 502 portunu açmak gerekmedi.

Yerel test (ekip broker'ı kapalıyken)
Bilgisayara Mosquitto kur: winget install EclipseFoundation.Mosquitto (Windows servisi olarak çalışır).
secrets.h içinde MQTT_HOST değerini "host.wokwi.internal" yap.
MQTT Explorer'da localhost:1883 (kullanıcı adı/şifre boş) ile bağlan.
Güvenlik
Broker şifresi yalnızca include/secrets.h içinde durur; bu dosya .gitignore'dadır.
Modbus TCP'de kimlik doğrulama yoktur; OpenPLC ortak ağa açılmamalıdır.
Wokwi for VS Code ücretsiz lisansı açık kaynak projeler içindir; ticari kullanım için ücretli lisans gerekir.