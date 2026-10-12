# Veri Sözleşmesi

Makine mesajlarının biçimini, sayaç artışının nasıl hesaplandığını ve OEE'nin nasıl bulunduğunu tanımlar. IoT, Backend ve Frontend aynı kurala bu dosyadan bakar. Kodda bu kurallara referans verirken bu dosyayı gösterin.

**Sürüm:** Hafta 3 (12 Ekim 2026) · **Sorumlu:** Proje Yöneticisi

> Sayaç kuralı geçicidir. Hafta 5'te PLC'ye 32-bit sayaçlar ve PLC'nin kendi çalışma süresi sayacı eklenecek, bu bölüm o zaman yeniden yazılacak.

## 1. Topic

```
Factory_1/Production_Line_1/Machine_1/data
```

- Yapı: `<fabrika>/<hat>/<makine>/data`
- Backend yalnızca sonu `/data` ile biten topic'leri işler. Alt başlıklara atılan mesajlar (ör. test mesajları) atlanır.
- Aynı topic'e aynı anda tek kaynak yazar: ESP32 ya da yedek Python köprüsü. İki kaynak birlikte yazarsa artış hesapları bozulur.

## 2. Mesaj

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

| Alan | Tip | Kural | Kaynak |
|---|---|---|---|
| `factory` | string | Topic'in 1. parçasıyla aynı | Sabit |
| `line` | string | Topic'in 2. parçasıyla aynı | Sabit |
| `machine` | string | Topic'in 3. parçasıyla aynı | Sabit |
| `ts` | integer | Unix zamanı, **milisaniye**, UTC. 2020–2100 arası | ESP32: NTP · Köprü: bilgisayar saati |
| `status` | boolean | `true` = makine çalışıyor | Coil 0 (`%QX0.0`) |
| `total_count` | integer | 0–32767, toplam üretim (hatalılar dahil) | HR0 (`%QW0`) |
| `reject_count` | integer | 0–32767, hatalı üretim | HR1 (`%QW1`) |

Gönderim kuralları:

- Mesaj saniyede bir gönderilir.
- Modbus okuması başarısız olursa o saniye mesaj gönderilmez, eski değer tekrar gönderilmez.
- ESP32'de saat senkron değilse de mesaj gönderilmez.

Geçersiz mesaj: JSON değilse, alanlardan biri eksikse, tipi yanlışsa ya da aralık dışındaysa mesaj atlanır. Sistem çökmez, önceki mesaj değişmez.

## 3. Sayaç kuralları

Sayaçlar 32767'den sonra 0'a döner, PLC yeniden başlayınca 0'dan başlar. İki sayaç (`total_count` ve `reject_count`) birbirinden bağımsız başa döner ve aşağıdaki adımlardan ayrı ayrı geçer. Süreyle ilgili kararlar ikisi için ortaktır.

Art arda gelen iki geçerli mesaj arası bir **adım**dır. Her adım için:

1. **Süre:** `süre = (yeni ts − eski ts) / 1000`, yukarı yuvarlanır. 1'den küçükse 1 alınır.
2. **Ham artış:** `ham = ((yeni − eski) % 32767 + 32767) % 32767`. Bu formülde 32767 ile 0 aynı sayılır, böylece başa dönme doğru hesaplanır.
3. **Uzun kesinti:** `süre > 3600` ise üretim bilinmiyor. Adım OEE'ye, "son 60 sn"ye ve toplam üretime girmez. Adım burada biter.
4. **Sıfırlanma:** `ham > süre + 4` ise sayaç sıfırlanmış kabul edilir, artış 0 olur. Aksi hâlde artış = ham. Makine saniyede en fazla 1 parça yapar; 4 okuma zamanlaması için paydır.
5. **Veri kesintisi:** `süre > 10` ise adım veri kesintisidir. Artış toplam üretime eklenir ama OEE'de ve "son 60 sn"de kullanılmaz. Aksi hâlde adım normaldir ve her yerde kullanılır.

| Durum | Eski → Yeni | Süre | Sonuç |
|---|---|---|---|
| Normal | 1517 → 1518 | 1 sn | Artış 1, normal |
| Duruş | 1517 → 1517 | 1 sn | Artış 0, normal |
| Başa dönme | 32766 → 0 | 1 sn | Artış 1, normal |
| Başa dönme | 32767 → 0 | 1 sn | Artış 0, normal |
| PLC yeniden başladı | 1517 → 3 | 1 sn | Ham 31.253 > 5, artış 0, normal |
| Kısa kesinti | 1517 → 1527 | 12 sn | Artış 10, kesinti |
| Kesinti | 1517 → 1586 | 86 sn | Artış 69, kesinti |
| Kesintide yeniden başladı | 32700 → 60 | 86 sn | Ham 127 > 90, artış 0, kesinti |
| Uzun kesinti | 1517 → 40 | 2 saat | Üretim bilinmiyor |
| ts ilerlemedi | 1517 → 1518 | 0 → 1 sn | Artış 1, normal |

## 4. OEE

Hesap, bir zaman aralığındaki mesaj listesi üzerinden yapılır. OEE fonksiyonları MQTT'ye ve veritabanına bağlı değildir.

- Her mesajın `status` değeri, bir sonraki mesaja kadar geçen süre için geçerlidir.
- **Aralığın süresi** = son mesajın ts'i − ilk mesajın ts'i. Saniyede bir mesajla 10 dakikalık aralık 601 mesajdır.
- **Planlı süre** = aralığın süresi − veri kesintisi adımlarının süresi (planlı duruşumuz yok).
- **Çalışma süresi** = `status` true olan normal adımların süresi.
- **İdeal çevrim süresi** = 1 sn (PLC çalışırken saniyede 1 parça üretir).
- **Toplam** = normal adımlardaki `total_count` artışları. **Hatalı** = normal adımlardaki `reject_count` artışları. **İyi** = Toplam − Hatalı.

```
Availability = Çalışma süresi / Planlı süre
Performance  = (İdeal çevrim süresi × Toplam) / Çalışma süresi
Quality      = İyi / Toplam
OEE          = Availability × Performance × Quality
```

Özel durumlar:

- Çalışma süresi 0 ise Availability 0, Performance ve Quality hesaplanmaz, OEE 0.
- Toplam 0 ise Performance 0, Quality hesaplanmaz, OEE 0.
- Performance 1'i geçerse 1 alınır.

Sonuçlar 0 ile 1 arasında döner. Ekranda yüzde olarak tek ondalıkla gösterilir.

Bizim PLC'den beklenen değerler: Availability %80 (8 sn çalışma, 2 sn duruş), Performance %100, Quality %95 (her 20. parça hatalı), **OEE %76**.

## 5. Ekran

- Göstergeler 0–1 arası değer alır ve yüzdeye kendisi çevirir.
- Renk: %70 altı kırmızı, %70 ile %85 arası (85 hariç) sarı, %85 ve üstü yeşil. Tam %70 sarı, tam %85 yeşildir.
- **Son 60 sn:** ts'i son mesajın ts'inden en fazla 60 sn geride olan normal adımların `total_count` artışlarının toplamı.
- 10 saniyeden uzun süre mesaj gelmezse ekran "veri gelmiyor" uyarısı gösterir.

## 6. Test senaryoları

Tolerans: ±0,1 yüzde puanı (`pytest.approx(0.76, abs=0.001)`).

OEE (10 dakikalık aralık, saniyede bir mesaj, 601 mesaj):

| # | Senaryo | Çalışma | Parça | Hatalı | A | P | Q | OEE |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal | 480 sn | 480 | 24 | %80 | %100 | %95 | %76 |
| 2 | Düşük kullanılabilirlik | 240 sn | 240 | 12 | %40 | %100 | %95 | %38 |
| 3 | Yüksek hata | 480 sn | 480 | 120 | %80 | %100 | %75 | %60 |

Sayaç (Backend ve Frontend aynı testleri çalıştırır):

1. 32766 → 32767 → 0 → 1 dizisinde toplam artış 2.
2. 32766'dan 1 sn sonra 0 gelirse artış 1.
3. 1517'den 1 sn sonra 3 gelirse artış 0.
4. 1517'den 86 sn sonra 1586 gelirse artış 69, adım kesinti ve OEE'ye girmez.
5. 1517'den 2 saat sonra 40 gelirse artış bilinmiyor (ör. `None`), toplam üretime eklenmez.

## 7. Açık konular

- ts geriye giderse (ör. NTP düzeltmesi) sayaç için süre 1 alınıyor, ama bu adımın süresinin OEE'ye nasıl gireceği henüz tanımlı değil. Öneri: süre 0'dan küçükse 0 alınsın.
- Hafta 5: 32-bit sayaçlar ve PLC çalışma süresi sayacı. PLC'nin yeniden başladığı çalışma süresinin azalmasından kesin anlaşılacak, geçen süre PLC'nin kendi saatinden ölçülecek. Bölüm 3 bu değişiklikle yeniden yazılacak.

## Değişiklik geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| Hafta 2 | Ekim 2026 | İlk sürüm: alanlar ve tipler, 5'ten büyük artış sıfırlanma sayılır. |
| Hafta 3 | 12 Ekim 2026 | Sınır geçen süreye bağlandı (süre + 4), veri kesintisi (10 sn) ve uzun kesinti (1 saat) eklendi, OEE sözleşmesi ve test senaryoları eklendi, yalnızca `/data` topic'i işlenir. |
