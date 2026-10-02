# OpenPLC Üretim Simülasyonu

Fabrika ortamını simüle etmek için OpenPLC ile kurulan sanal PLC. Program bir üretim sayacı ve bir makine durum biti üretir. Bu değerler Modbus TCP üzerinden dışarıya açılır.

## Bitirme kriterleri

| Kriter | Sonuç |
|---|---|
| COUNTER1 her saniye 1 artıyor | ✅ |
| STATUS_BIT 5 saniyede bir TRUE/FALSE değişiyor | ✅ |
| Modbus TCP Server 502 portunda aktif | ✅ |

## Klasör yapısı

```
ladder-proje/      OpenPLC Editor (v4) Ladder Logic projesi
st/uretim.st       Aynı programın Structured Text karşılığı (v3 Runtime web paneline yüklenen dosya)
test/modbus_oku.py Modbus TCP üzerinden değerleri okuyan test betiği
ekran-goruntuleri/ Doğrulama ekran görüntüleri
```

## Değişkenler

| Ad | Tip | Adres | Modbus | Açıklama |
|---|---|---|---|---|
| COUNTER1 | INT | %QW0 | Holding Register 0 | Üretim sayacı, her saniye +1 |
| STATUS_BIT | BOOL | %QX0.0 | Coil 0 | Makine durumu, 5 sn TRUE / 5 sn FALSE |
| TICK | BOOL | – | – | 1 saniyelik darbe |
| T_OFF_DONE | BOOL | – | – | Kapalı süre doldu bilgisi |
| T_1S, T_ON, T_OFF | TON | – | – | Zamanlayıcılar |
| C1 | CTU | – | – | Sayaç |

## Ladder mantığı

```
Rung 1  |--|/ TICK|-------[TON T_1S  PT=T#1s]-----( TICK )--|
Rung 2  |--| TICK |-------[CTU C1  PV=32767 ] CV => COUNTER1
Rung 3  |--|/ T_OFF_DONE|-[TON T_ON  PT=T#5s]-----( STATUS_BIT )--|
Rung 4  |--| STATUS_BIT|--[TON T_OFF PT=T#5s]-----( T_OFF_DONE )--|
```

- **Rung 1–2:** Zamanlayıcı kendi çıkışıyla sıfırlanır. Böylece her saniye bir taramalık darbe üretir. CTU bu darbeleri sayar.
- **Rung 3–4:** İki zamanlayıcı birbirini tetikler (flaşör). STATUS_BIT 5 saniye açık, 5 saniye kapalı kalır.

## Çalıştırma

### OpenPLC Editor v4 + Runtime v4

1. `ladder-proje` klasörünü Editor'de aç.
2. **Device** bölümünde cihaz olarak `OpenPLC Runtime v4`, IP olarak `127.0.0.1` seç ve **Connect**'e bas.
3. **Servers** bölümüne Modbus/TCP sunucusu ekle, port `502`.
4. **Build and upload** ile programı yükle. Değerler Editor'ün Debug ekranında canlı izlenir.

### Runtime v3 web paneli (localhost:8080)

Bu kurulum Windows'ta WSL Ubuntu üzerinde yapıldı.

1. Kurulum:
   ```
   git clone https://github.com/thiagoralves/OpenPLC_v3.git
   cd OpenPLC_v3
   CMAKE_POLICY_VERSION_MINIMUM=3.5 ./install.sh linux
   sudo ./start_openplc.sh
   ```
2. http://localhost:8080 adresini aç ve `openplc` / `openplc` ile giriş yap.
3. **Programs → Upload Program** ile `st/uretim.st` dosyasını yükle, sonra **Start PLC**'ye bas.
4. **Monitoring** sayfasında değerleri canlı izle.
5. **Settings** sayfasında Modbus Server'ı aç, port `502`.

### Modbus testi

```
pip install pymodbus
python test/modbus_oku.py
```

## Kurulumda karşılaşılan sorunlar

| Sorun | Çözüm |
|---|---|
| Runtime v3 kurulumunda `Compatibility with CMake < 3.5 has been removed` hatası | Kurulumu `CMAKE_POLICY_VERSION_MINIMUM=3.5` ortam değişkeniyle çalıştırmak |
| WSL'de `/mnt/c/...` altında `git clone` sırasında chmod hatası | Linux ev klasöründe (`cd ~`) çalışmak |
| Editor'de `Undeclared variable 'T_1S'` derleme hatası | TON ve CTU blok örneklerini değişken tablosuna tanımlamak |
| Runtime v4'te 8080 web paneli bulunmuyor | Canlı izlemeyi Editor'ün Debug ekranından yapmak; 8080 paneli için ayrıca v3 kurmak |

## Öğrenilen konular

- **PLC:** Girişleri okuyan, programı çalıştıran ve çıkışları yazan döngüyü sürekli tekrar eden endüstriyel bir bilgisayar. Bu projede tarama süresi 20 ms.
- **Ladder Logic:** Programın röle şeması gibi çizilmesi. Kontaklar koşulları, bobinler çıkışları temsil eder. TON zamanlayıcı ve CTU sayaç blok olarak kullanılır.
- **Modbus TCP:** İstemci-sunucu yapısında, 502 portunda çalışan bir protokol. PLC sunucu, okuyan program istemci rolündedir. Coil 1 bitlik, Holding Register 16 bitlik veri tutar.
