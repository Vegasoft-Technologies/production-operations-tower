# Yedek Python köprüsü (OpenPLC → MQTT)

ESP32 (Wokwi) çalışamadığında onun yerine geçen yedek köprü. OpenPLC'yi doğrudan Modbus TCP ile okur ve ESP32 ile **aynı JSON'u aynı topic'e her saniye** yayınlar.

```
OpenPLC (localhost:502) --Modbus TCP--> kopru.py --MQTT--> yerel Mosquitto (127.0.0.1:1883) --bridge, Tailscale--> ekip broker'ı
```

Köprü yerel Mosquitto'ya yazar. Mesajlar, ESP32 için kurulan Mosquitto köprüsü üzerinden ekip broker'ına gider (bkz. `edge/esp32/README.md`). Bu yüzden kodda şifre ya da IP yoktur.

## Yayınlanan veri

Topic: `Factory_1/Production_Line_1/Machine_1/data`

```json
{"factory":"Factory_1","line":"Production_Line_1","machine":"Machine_1","ts":1760180400000,"status":true,"total_count":1234,"reject_count":61}
```

| Alan | Kaynak |
|---|---|
| ts | Bilgisayarın saati (Unix zamanı, milisaniye) |
| status | Coil 0 (%QX0.0) |
| total_count | HR0 (%QW0) |
| reject_count | HR1 (%QW1) |

Kurallar:

- Modbus okuması başarısız olursa o saniye mesaj gönderilmez.
- MQTT client ID: `python-kopru-machine-1-<PID>` (ESP32'ninki `esp32-machine-1`). İşlem numarası (PID) sayesinde köprü yanlışlıkla iki kez açılırsa iki kopya aynı ID ile birbirini broker'dan düşürmez; ikincisi açılış kontrolünde birincinin mesajlarını görüp çalışmayı reddeder.
- **Köprü açıkken bu topic'e elle mesaj atmayın!** Köprü bunu ikinci kaynak sanıp durur. Test mesajları için `Factory_1/Production_Line_1/Machine_1/test` topic'ini kullanın.
- **Aynı anda tek kaynak:** Köprü açılırken 3 saniye topic'i dinler. Mesaj geliyorsa (ESP32 açıksa) başlamayı reddeder. Çalışırken başka bir kaynak yazmaya başlarsa durur. Aynı topic'e iki kaynak yazarsa artış hesapları bozulur.

## Kurulum (Windows, bir kez)

Python 3.10 veya üstü gerekir.

```
cd edge\python-kopru
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Çalıştırma

Önce şunlar hazır olmalı:

1. OpenPLC çalışıyor (`localhost:8080`'de **Running**).
2. Mosquitto servisi ve köprüsü çalışıyor (`$SYS/broker/connection/<bilgisayar>.nese/state` = 1).
3. **Bilgisayarın saati doğru.** ts bilgisayarın saatinden alınır. ESP32 ise NTP kullanır. Saat kaymışsa ESP32'den köprüye geçişte ts geriye ya da ileriye sıçrar ve geçen süre hesapları bozulur. Yönetici PowerShell'de:
   ```
   net start w32time
   w32tm /resync /force
   ```
   Kontrol için tarayıcıda `time.is`'e bak.

Sonra:

```
.venv\Scripts\python kopru.py
```

Her saniye bir `[PUB] {...}` satırı görünür. Durdurmak için **Ctrl+C**; açılış kontrolü sırasında da temiz çıkar (çıkış kodu 0).

Çıkış kodları: `0` Ctrl+C ile durduruldu, `1` MQTT'ye bağlanılamadı, `2` topic'e başka bir kaynak yazıyor.

## ESP32'den köprüye geçiş

Veri akışında 10 saniyeden uzun boşluk "veri kesintisi" sayılır. Geçişi bu süre içinde yap.

1. Köprünün terminalini önceden hazırla: `edge\python-kopru` klasöründe, komut yazılı, Enter'a basılmamış.
2. VS Code'da Wokwi simülatörünü durdur (■).
3. Hemen köprünün terminalinde **Enter**'a bas.
4. 3 saniyelik kontrolden sonra `[Kontrol] OK` ve ardından `[PUB]` satırları gelmeli.

`[Kontrol] HATA: Bu topic'e su an baska bir kaynak yaziyor` görürsen ESP32 hâlâ yayın yapıyordur. Simülatörün durduğundan emin olup tekrar başlat.

## Köprüden ESP32'ye geri dönüş

1. Köprüde **Ctrl+C**.
2. VS Code'da **F1 → Wokwi: Start Simulator**.

Köprüyü kapatmadan ESP32'yi açarsan köprü bunu fark edip kendini durdurur. Yine de sırayla yapmak daha temiz.

## Güvenlik

- Kodda şifre, IP ya da `.env` yoktur. Köprü yalnızca `127.0.0.1`'deki Mosquitto'ya bağlanır.
- `.venv/` klasörü repoya girmez (`.gitignore`).
