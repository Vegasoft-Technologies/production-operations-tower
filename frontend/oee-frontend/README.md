# oee-frontend

Üretim izleme sisteminin operatör/yönetici ekranı. React + Vite + Apache ECharts.

Backend'in SSE uç noktasından (`/stream`) makine verisini ve oturum OEE değerlerini canlı alır;
son 60 saniyede üretilen parçayı, makine durumunu, oturumun toplam/hatalı üretimini ve
Availability / Performance / Quality göstergelerini gösterir. Altında trend grafikleri var. Soldaki ağaç menü ISA-95 hiyerarşisini
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
| `telemetry.test.js` | Makine mesajı doğrulama (alanlar, tipler, ts milisaniye) |
| `oeeMessage.test.js` | OEE mesajı doğrulama (oranlar 0–1, null'lar, oturum zamanları) |
| `format.test.js` | Süre/saat biçimi, trend grafiğindeki "veri yok" aralıkları |
| `mock.test.js` | Sahte veri kaynağı (PLC gibi davranış, örnek OEE mesajı) |

## OEE göstergeleri ve oturum kartları

Değerler backend'in aynı `/stream` bağlantısından gönderdiği `event: oee` mesajından gelir
(5 sn'de bir). Makine mesajları isimsiz gelir (`onmessage`), OEE mesajı
`addEventListener('oee', …)` ile dinlenir. Mesaj sözleşmeye göre denetlenir
(`src/lib/oeeMessage.js`): oranlar 0–1, `performance`/`quality` null olabilir. Uymayan mesaj atılır;
OEE başlığının altında hangi alanın sorunlu olduğunu söyleyen kısa bir not 30 sn görünür
(ayrıntı tarayıcı konsolunda).

- Göstergeler 0–1 arası oran alır ve yüzdeye kendileri çevirir. Hesaplanamayan değer "—" görünür.
- Renkler: %70 altı kırmızı, %70–85 sarı, %85 ve üstü yeşil (`src/lib/gauge.js`).
  Renk, ekranda görünen tek ondalıklı yüzdeye göre seçilir: %70,0 sarı, %85,0 yeşil.
- **Toplam üretim** ve **Hatalı üretim** kartları ham sayacı değil, oturumun OEE hesabındaki
  `total` ve `reject` değerini gösterir. Kartların altında oturumun başlangıç saati yazar.
- Oturumda veri kesintisi olduysa kartın altında not çıkar: veri yok süresi ve kesintide
  üretilip OEE dışında kalan parça (`no_data_seconds >= 1` ya da `gap_parts > 0` ise).
- `session_end` doluysa oturum kapanmıştır: kartlar son oturumu gösterir ve "Oturum kapandı" notu çıkar.
- 15 sn'dir OEE mesajı gelmezse ya da bağlantı koparsa değerler soluk görünür.

### Sahte veri seçenekleri

`VITE_STREAM_URL=mock` iken sahte kaynak 5 sn'de bir sabit örnek OEE mesajı gönderir
(A %80, P %100, Q %95, Toplam 480, Hatalı 24). Adres çubuğundan değiştirilebilir:

```
http://localhost:5173/?a=0.65&p=0.76&q=0.95   → göstergeler kırmızı, sarı, yeşil
http://localhost:5173/?a=0.70&p=0.85&q=0.95   → sarı (tam %70), yeşil (tam %85), yeşil
http://localhost:5173/?oturum=kapali           → "Oturum kapandı" notu
http://localhost:5173/?kesinti=1               → veri kesintisi notu (86 sn, 69 parça)
```

Hatalı sayısı Quality ile tutarlı seçilir: (Toplam − Hatalı) ÷ Toplam = Quality.

## Trend grafikleri (taslak)

OEE ve A, P, Q için zamana göre çizgi grafik, üretim adedi için alan grafik
(`src/components/TrendCharts.jsx`). Bu hafta örnek sabit veriyle çalışır
(`src/data/trendSample.js`). Veri olmayan aralıklar `null`'dır: çizgi orada kopar
(`connectNulls: false`) ve gri "veri yok" bandı çizilir. Grafiğin altındaki
"Tablo olarak göster" aynı veriyi tablo halinde gösterir.

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
    TrendCharts.jsx        Trend grafikleri (çizgi + alan)
  data/plantTree.js        Ağaç verisi (şimdilik sabit, Hafta 7'de backend'den)
  data/trendSample.js      Trend grafikleri için örnek veri
  hooks/useMachineStream.js  SSE bağlantısı (makine + oee olayları), yeniden bağlanma, veri kesintisi
  lib/
    counter.js             Sayaç kuralları
    gauge.js               Renk ve yüzde biçimi
    telemetry.js           Makine mesajı doğrulama
    oeeMessage.js          OEE mesajı doğrulama
    format.js              Süre ve saat biçimi
    trend.js               Trend grafiği yardımcıları
    mockSource.js          Sahte veri kaynağı (makine + OEE mesajı)
    oeeSample.js           Örnek OEE değerleri
tests/                     Otomatik testler
```
