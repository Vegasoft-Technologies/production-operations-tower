# oee-frontend

Üretim izleme sisteminin operatör/yönetici ekranı. React + Vite + Apache ECharts.

Backend'in SSE uç noktasından (`/stream`) makine verisini canlı alır; son 60 saniyede
üretilen parçayı, toplam/hatalı üretimi, makine durumunu ve Availability / Performance /
Quality göstergelerini gösterir. Soldaki ağaç menü ISA-95 hiyerarşisini
(Fabrika > Hat > Makine) gösterir.

## Kurulum

Gerekli: Node.js 20 veya üstü (`node --version`).

```
cd frontend/oee-frontend
npm install
```

## Ayarlar (.env)

`.env.example` dosyasını `.env` adıyla kopyalayıp backend'in SSE adresini yaz:

```
VITE_STREAM_URL=http://<NESE_TAILSCALE_IP>:8000/stream
```

- Adres boş bırakılır ya da `mock` yazılırsa ekran **sahte veriyle** çalışır
  (PLC gibi: 8 sn çalışır, 2 sn durur, her 20. parça hatalı). Ekranda "sahte veri" etiketi görünür.
- `.env` GitHub'a yüklenmez (`.gitignore`'da). IP ya da şifre içeren dosyaları commit'leme.
- Windows'ta dosyayı CMD ile oluşturmak için:
  `echo VITE_STREAM_URL=http://<NESE_TAILSCALE_IP>:8000/stream> .env`
  (PowerShell'deki `echo` dosyayı farklı kodlamayla yazar, Vite okuyamaz.)
- `.env` değişince `npm run dev`'i durdurup yeniden başlat.

## Çalıştırma

```
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç. Durdurmak için terminalde Ctrl+C.

## Testler

```
npm test
```

Testler `tests/` klasöründe, Node'un kendi test aracıyla çalışır:

| Dosya | Ne test ediliyor |
| --- | --- |
| `counter.test.js` | Sayaç kuralları (backend'deki pytest senaryolarıyla aynı) |
| `gauge.test.js` | Gösterge renk eşikleri ve yüzde biçimi |
| `telemetry.test.js` | Mesaj doğrulama (alanlar, tipler, ts milisaniye) |
| `mock.test.js` | Sahte veri kaynağının PLC gibi davranması |

## OEE göstergeleri

Bu hafta değerler örnek (A %80, P %100, Q %95); gerçek değerler Hafta 4'te backend'den gelecek.
Göstergeler 0–1 arası oran alır ve yüzdeye kendileri çevirir.

Renkler: %70 altı kırmızı, %70–85 sarı, %85 ve üstü yeşil (`src/lib/gauge.js`).
Renk, ekranda görünen tek ondalıklı yüzdeye göre seçilir: %70,0 sarı, %85,0 yeşil.

Farklı değerleri denemek için adres çubuğundan verilebilir (a = Availability, p = Performance, q = Quality):

```
http://localhost:5173/?a=0.65&p=0.76&q=0.95   → kırmızı, sarı, yeşil
http://localhost:5173/?a=0.70&p=0.85&q=0.95   → sarı, yeşil, yeşil
```

## Sayaç kuralları (özet)

Ayrıntı: `docs/veri-sozlesmesi.md`.

- Artış = `((yeni - eski) % 32767 + 32767) % 32767`
- Geçen süre = iki mesajın `ts` farkı, saniye, yukarı yuvarlanır, en az 1.
- Artış > geçen saniye + 4 ise sayaç sıfırlanmış sayılır, artış 0.
- İki mesaj arası 10 sn'den uzunsa adım **kesinti**dir: "son 60 sn" göstergesine girmez.
- Ara 1 saati aşarsa artış bilinmiyor sayılır.

## Klasör yapısı

```
src/
  App.jsx                  Sayfa düzeni
  components/
    OeeGauge.jsx           A / P / Q göstergesi (tek bileşen, 3 kez kullanılıyor)
    RateGauge.jsx          "Son 60 sn" parça göstergesi
    PlantTree.jsx          ISA-95 ağaç menü
  data/plantTree.js        Ağaç verisi (şimdilik sabit, Hafta 7'de backend'den)
  hooks/useMachineStream.js  SSE bağlantısı, yeniden bağlanma, veri kesintisi
  lib/
    counter.js             Sayaç kuralları
    gauge.js               Renk ve yüzde biçimi
    telemetry.js           Mesaj doğrulama
    mockSource.js          Sahte veri kaynağı
    oeeSample.js           Örnek OEE değerleri
tests/                     Otomatik testler
```
