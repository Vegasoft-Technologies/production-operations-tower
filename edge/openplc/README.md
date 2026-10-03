# OpenPLC Üretim Simülasyonu

Fabrika ortamını simüle eden sanal PLC. Program bir makinenin çalışma/duruş döngüsünü, toplam üretimi ve hatalı üretimi üretir. Bu değerler Modbus TCP üzerinden dışarıya açılır ve OEE hesabında kullanılır.

## Asıl kaynak

**Asıl kaynak: `st/uretim.st` + OpenPLC Runtime v3** (WSL Ubuntu üzerinde, web paneli `localhost:8080`). Hafta 2'de ESP32 bu Runtime'a Modbus TCP ile bağlanacak.

`ladder-proje/` (OpenPLC Editor v4, `main.ld`) aynı programın Ladder karşılığıdır. Editor'ün dahili simülatöründe (Device: `OpenPLC Simulator`) derlenir ve Debug ekranında izlenir. **İki dosya her zaman aynı mantığı içermelidir:** birinde yapılan değişiklik diğerine de uygulanır. Her rung, `uretim.st`'de aynı numaralı yorumla işaretli bölüme karşılık gelir.

Hafta 2 notu: WSL varsayılan olarak portları yalnızca bu bilgisayarın `localhost` adresine açar. ESP32'nin ağdan erişebilmesi için WSL'in "mirrored" ağ moduna alınması (`%USERPROFILE%\.wslconfig` içinde `[wsl2]` altında `networkingMode=mirrored`) ve Windows Güvenlik Duvarı'nda 502 portuna izin verilmesi gerekir.

## Klasör yapısı

```
st/uretim.st         Asıl kaynak: Structured Text programı (v3 Runtime)
ladder-proje/        Aynı programın Ladder karşılığı (OpenPLC Editor v4)
test/modbus_oku.py   Modbus TCP doğrulama betiği
test/requirements.txt
ekran-goruntuleri/   Doğrulama ekran görüntüleri ve test çıktıları
```

## Modbus adresleri

| Modbus | PLC adresi | Değişken | Tip | Anlamı |
|---|---|---|---|---|
| Holding Register 0 | %QW0 | COUNTER1 | INT | Toplam üretim (hatalılar dahil) |
| Holding Register 1 | %QW1 | REJECT_COUNTER | INT | Hatalı üretim |
| Coil 0 | %QX0.0 | STATUS_BIT | BOOL | Makine durumu: TRUE = çalışıyor, FALSE = duruşta |

**Sayaçlar hakkında:**

- İki sayaç da 32767'ye ulaştıktan sonra 0'dan devam eder (yaklaşık 11,4 saatte bir).
- PLC yeniden başlatılınca iki sayaç da 0'dan başlar.
- Artış hesaplayan taraf (backend) bu iki durumu tanımalıdır.

## Davranış

| Özellik | Değer |
|---|---|
| Döngü | 8 sn çalışma (STATUS_BIT = TRUE), 2 sn duruş (STATUS_BIT = FALSE) |
| Üretim hızı | Çalışırken saniyede 1 parça; duruşta sayaç artmaz |
| Hatalı oranı | Çalışırken üretilen her 20. parça hatalı (Quality = %95). Hatalılar COUNTER1'e de dahildir. |
| Beklenen OEE | Availability ≈ %80, Performance ≈ %100, Quality = %95, OEE ≈ %76 |
| 10 dakikada | COUNTER1 ≈ +480, REJECT_COUNTER ≈ +24 |

## Değişkenler

| Ad | Tip | Adres | Açıklama |
|---|---|---|---|
| COUNTER1 | INT | %QW0 | Toplam üretim |
| REJECT_COUNTER | INT | %QW1 | Hatalı üretim |
| STATUS_BIT | BOOL | %QX0.0 | Makine çalışıyor |
| TICK | BOOL | – | 1 saniyelik darbe |
| CALISMA_BITTI | BOOL | – | 8 sn çalışma süresi doldu |
| URETIM_DARBE | BOOL | – | Çalışırken gelen darbe = 1 parça |
| C1_DOLU | BOOL | – | Toplam sayaç doldu (sıfırlama için) |
| PARCA_20 | BOOL | – | 20. parça (hatalı) |
| HATA_DOLU | BOOL | – | Hatalı sayaç doldu (sıfırlama için) |
| T_1S | TON | – | Darbe zamanlayıcısı |
| T_DURUS | TON | – | Duruş süresi (2 sn) |
| T_CALISMA | TON | – | Çalışma süresi (8 sn) |
| C1 | CTU | – | Toplam üretim sayacı |
| C_PARCA | CTU | – | 20'ye kadar sayan parça sayacı |
| C_HATA | CTU | – | Hatalı üretim sayacı |

## Ladder mantığı

```
Rung 1 |--|/ TICK|----------[TON T_1S      PT=T#960ms]--( TICK )
Rung 2 |--|/ CALISMA_BITTI|-[TON T_DURUS   PT=T#2s   ]--( STATUS_BIT )
Rung 3 |--| STATUS_BIT|-----[TON T_CALISMA PT=T#8s   ]--( CALISMA_BITTI )
Rung 4 |--| TICK|--| STATUS_BIT|------------------------( URETIM_DARBE )
Rung 5 |--| URETIM_DARBE|---[CTU C1      R=C1_DOLU   PV=32767]--( C1_DOLU )    CV => COUNTER1
Rung 6 |--| URETIM_DARBE|---[CTU C_PARCA R=PARCA_20  PV=20   ]--( PARCA_20 )
Rung 7 |--| PARCA_20|-------[CTU C_HATA  R=HATA_DOLU PV=32767]--( HATA_DOLU )  CV => REJECT_COUNTER
```

- **Rung 1:** TON kendi çıkışıyla sıfırlanır. Periyot = PT + 2 tarama (20 ms) = 960 ms + 40 ms = 1 sn.
- **Rung 2–3:** İki zamanlayıcı birbirini tetikler. T_DURUS 2 sn sonra makineyi çalıştırır, T_CALISMA 8 sn sonra durdurur.
- **Rung 4:** Darbe yalnızca makine çalışırken parça sayılır.
- **Rung 5, 7:** Sayaç PV'ye ulaşınca Q çıkışı bir sonraki taramada R girişini tetikler ve sayaç 0'dan devam eder.
- **Rung 6:** Her 20 parçada bir PARCA_20 bir tarama boyunca TRUE olur ve hatalı sayacı bir artırır.

## Çalıştırma

### Asıl kurulum: v3 Runtime web paneli (localhost:8080)

Bu kurulum Windows'ta WSL Ubuntu üzerinde yapıldı.

1. Kurulum:
   ```
   git clone https://github.com/thiagoralves/OpenPLC_v3.git
   cd OpenPLC_v3
   CMAKE_POLICY_VERSION_MINIMUM=3.5 ./install.sh linux
   ```
   Kurulum Runtime'ı bir servis olarak kaydeder; WSL açılınca (PowerShell'de `wsl`) kendiliğinden başlar.
2. http://localhost:8080 adresinde giriş yap ve **varsayılan şifreyi değiştir** (bkz. Güvenlik).
3. **Programs → Upload Program** ile `st/uretim.st` dosyasını yükle, sonra **Start PLC**'ye bas.
4. **Settings** sayfasında Modbus Server'ı aç (port 502) ve **Start in run mode** seçeneğini işaretle.
5. **Monitoring** sayfasında COUNTER1, REJECT_COUNTER ve STATUS_BIT'i canlı izle.

### Ladder projesi: OpenPLC Editor v4 (simülatör)

1. `ladder-proje/` klasörünü Editor'de aç.
2. **Device → Configuration** bölümünde cihaz `OpenPLC Simulator` olarak kayıtlıdır.
3. **Build** ile derle, Debug ekranında rung'ları canlı izle.

## Test

```
pip install -r test/requirements.txt
python test/modbus_oku.py                 # 30 sn: durum süreleri, sayım, hatalı oranı
python test/modbus_oku.py --sure 600      # 10 dakikalık test
python test/modbus_oku.py --pv 10         # taşma testi (PLC'de C1 için PV=10 iken)
```

Betik HR0, HR1 ve Coil 0'ı okur ve şunları kontrol eder:

- Çalışma 8 sn, duruş 2 sn sürüyor.
- Her çalışma döneminde COUNTER1 8 ± 1 artıyor, duruşta hiç artmıyor.
- Hatalı artış toplam artıştan büyük değil ve toplamın yaklaşık 1/20'si.

Çıkış kodları: `0` başarılı, `1` bağlantı hatası, `2` kontrol hatası.

### Taşma testi

1. `uretim.st`'de C1 satırında (ve Ladder'da Rung 5'te) PV'yi geçici olarak `10` yap ve programı v3'e yükle.
2. `python test/modbus_oku.py --pv 10` çalıştır. Sayacın 10'dan sonra 0'a döndüğünü doğrular.
3. Test bitince PV'yi `32767`'ye geri al ve programı tekrar yükle.

## Güvenlik

- **v3 web panelinin varsayılan şifresini (`openplc` / `openplc`) kurulumdan hemen sonra değiştirin.** Users sayfasında kullanıcıya tıklayıp yeni şifre girin.
- **Modbus TCP'de kimlik doğrulama ve şifreleme yoktur.** Ağdaki herkes değerleri okuyabilir ve PLC'ye yazabilir. Bu simülasyonu kampüs Wi-Fi gibi ortak ağlarda çalıştırmayın; yalnızca kendi bilgisayarınızda ya da izole bir test ağında kullanın.

## Kurulumda karşılaşılan sorunlar

| Sorun | Çözüm |
|---|---|
| v3 kurulumunda `Compatibility with CMake < 3.5 has been removed` hatası | Kurulumu `CMAKE_POLICY_VERSION_MINIMUM=3.5` ortam değişkeniyle çalıştırmak |
| WSL'de `/mnt/c/...` altında `git clone` sırasında chmod hatası | Linux ev klasöründe (`cd ~`) çalışmak |
| Editor'de `Undeclared variable 'T_1S'` derleme hatası | TON ve CTU blok örneklerini değişken tablosuna tanımlamak |
| v4 Runtime'da 8080 web paneli yok | Asıl Runtime olarak v3 seçildi; Ladder projesi Editor'ün simülatöründe izleniyor |
| v3 servisi zaten çalışırken `start_openplc.sh` → `Address already in use` | Servis WSL açılınca kendiliğinden başlar; elle başlatmaya gerek yok (`systemctl status openplc`) |

## Öğrenilen konular

- **PLC:** Girişleri okuyan, programı çalıştıran ve çıkışları yazan döngüyü sürekli tekrar eden endüstriyel bilgisayar. Bu projede tarama süresi 20 ms.
- **Ladder Logic:** Programın röle şeması gibi çizilmesi. Kontaklar koşulları, bobinler çıkışları temsil eder. TON zamanlayıcı ve CTU sayaç blok olarak kullanılır.
- **Modbus TCP:** İstemci-sunucu yapısında, 502 portunda çalışan protokol. PLC sunucu, okuyan program istemcidir. Coil 1 bitlik, Holding Register 16 bitlik veri tutar.
