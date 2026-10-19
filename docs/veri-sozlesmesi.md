# Veri Sözleşmesi

Makine mesajlarının biçimini, sayaç artışının nasıl hesaplandığını, üretim oturumlarını ve OEE'nin nasıl bulunduğunu tanımlar. IoT, Backend ve Frontend aynı kurala bu dosyadan bakar. Kodda bu kurallara referans verirken bu dosyayı gösterin.

**Sürüm:** Hafta 4 (19 Ekim 2026) · **Sorumlu:** Proje Yöneticisi

> Sayaç kuralı geçicidir. Hafta 5'te PLC'ye 32-bit sayaçlar ve PLC'nin kendi çalışma süresi sayacı eklenecek, bu bölüm o zaman yeniden yazılacak.

## 1. Topic

```
Factory_1/Production_Line_1/Machine_1/data
```

- Yapı: `<fabrika>/<hat>/<makine>/data`
- Backend yalnızca tam 4 parçalı ve son parçası `data` olan topic'leri işler. Başka topic'lere atılan mesajlar atlanır (ör. `…/Machine_1/test`, `…/Machine_1/deneme/data`).
- Test mesajları `Factory_1/Production_Line_1/Machine_1/test` topic'ine atılır. Bu mesajlar ekrana düşmez.
- Aynı topic'e aynı anda tek kaynak yazar: ESP32 ya da yedek Python köprüsü. İki kaynak birlikte yazarsa artış hesapları bozulur.

## 2. Mesaj

Bu bölüm makineden gelen mesajı tanımlar. Backend'in ekrana gönderdiği OEE mesajı Bölüm 5.2'de.

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

1. **Süre:** `süre = (yeni ts − eski ts) / 1000`, yukarı yuvarlanır. 1'den küçükse (ts ilerlemediyse ya da geriye gittiyse) 1 alınır.
2. **Ham artış:** `ham = ((yeni − eski) % 32767 + 32767) % 32767`. Bu formülde 32767 ile 0 aynı sayılır, böylece başa dönme doğru hesaplanır.
3. **Uzun kesinti:** `süre > 3600` ise üretim bilinmiyor. Adım OEE'ye, "son 60 sn"ye ve toplam üretime girmez. Adım burada biter. Oturum bu durumda zaten kendiliğinden kapanmış olur (Bölüm 4.1).
4. **Sıfırlanma:** `ham > süre + 4` ise sayaç sıfırlanmış kabul edilir, artış 0 olur. Aksi hâlde artış = ham. Makine saniyede en fazla 1 parça yapar. 4 okuma zamanlaması için paydır.
5. **Veri kesintisi:** `süre > 10` ise adım veri kesintisidir. Artış toplam üretime eklenir ama OEE'nin Toplam ve Hatalı'sına ve "son 60 sn"ye girmez. Adımın süresi planlı sürede kalır ve "veri yok" sayılır (Bölüm 4.2). Aksi hâlde adım normaldir ve her yerde kullanılır.

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
| ts geriye gitti | 1517 → 1518 | −0,5 → 1 sn | Artış 1, normal. OEE'deki süresi 0 |

## 4. Üretim oturumu ve OEE

### 4.1 Üretim oturumu

Ekibin çalışma saatleri sabit olmadığı için planlı süreyi vardiya takvimi değil üretim oturumu belirler. Oturumu backend kendisi yönetir, kimsenin oturum başlatması ya da bitirmesi gerekmez. Simülasyonda makine yalnızca biz çalıştırınca var olduğu için verinin aktığı süreyi planlı süre sayıyoruz.

- Makineden geçerli bir mesaj geldiğinde o makinenin açık oturumu yoksa backend yeni bir oturum açar. Oturumun başlangıcı bu mesajın ts'idir.
- 1 saatten uzun veri gelmezse oturum son mesajın ts'inde kendiliğinden kapanır. Sonra gelen ilk mesaj yeni bir oturum açar. Bu yüzden 1 saati aşan bir kesinti hiçbir oturumun içinde kalmaz.
- Aynı makinede aynı anda tek açık oturum olur.
- Oturum kaydı: başlangıç ve bitiş (oturum açıkken boş).
- Veri kesildiğinde oturum 1 saat boyunca açık kalır. Bu sürede planlı süre işlemeye devam ettiği için ekrandaki Availability düşer. Oturum kapanınca planlı süre son mesaja çekilir ve değerler düzelir.
- Elle oturum başlatıp bitirme (iş emri gibi) Hafta 11'de operatör ekranıyla eklenebilir (Bölüm 7).

### 4.2 OEE hesabı

Hesap, bir oturumun mesajları üzerinden yapılır. OEE fonksiyonları MQTT'ye ve veritabanına bağlı değildir. Mesaj listesini ve planlı süreyi dışarıdan alır. Backend hesabı her seferinde veritabanındaki mesajlardan yapar, bellekte biriktirmez.

- Her mesajın `status` değeri, bir sonraki mesaja kadar geçen süre için geçerlidir.
- **Planlı süre** = oturumun başından sonuna (oturum açıksa şu ana) kadar geçen süre. Planlı duruş ve kısa duruş eşiği yoktur, bütün duruşlar Availability'den düşer.
- **Çalışma süresi** = `status` true olan normal adımların süresi. ts geriye giden bir adımın süresi 0 alınır.
- **Veri yok süresi** = planlı süre − normal adımların süresi. Kesinti adımlarını ve oturum açıkken son mesajdan bu yana geçen süreyi kapsar. Planlı sürede kalır ama çalışma süresine girmez: ne olduğunu bilmediğimiz süreyi çalıştı ya da durdu sayamayız.
- **İdeal çevrim süresi** = 1 sn (PLC çalışırken saniyede 1 parça üretir).
- **Toplam** = normal adımlardaki `total_count` artışları. **Hatalı** = normal adımlardaki `reject_count` artışları. **İyi** = Toplam − Hatalı. İyi eksi çıkarsa 0 alınır.
- Kesinti adımlarındaki `total_count` artışları OEE'ye girmez. Bu parçalar OEE mesajında `gap_parts` olarak gösterilir ve veritabanındaki toplam üretime eklenir.

```
Availability = Çalışma süresi / Planlı süre
Performance  = (İdeal çevrim süresi × Toplam) / Çalışma süresi
Quality      = İyi / Toplam
OEE          = Availability × Performance × Quality
```

Özel durumlar:

- Çalışma süresi 0 ise Availability 0, Performance ve Quality hesaplanmaz (`null`), OEE 0.
- Toplam 0 ise Performance 0, Quality hesaplanmaz (`null`), OEE 0.
- Performance 1'i geçerse 1 alınır.
- Hatalı, Toplam'dan büyük gelebilir (ör. hatalı parça bir sonraki adımda sayılırsa ya da sayaçlardan biri yanlışlıkla sıfırlanmış sayılırsa). Bu durumda İyi 0 alınır, Quality 0 olur ve backend log'a uyarı yazar. Toplam ve Hatalı ekranda geldiği gibi gösterilir.

Sonuçlar 0 ile 1 arasında döner. Ekranda yüzde olarak tek ondalıkla gösterilir.

Bizim PLC'den beklenen değerler: Availability %80 (8 sn çalışma, 2 sn duruş), Performance %100, Quality %95 (her 20. parça hatalı), **OEE %76**.

## 5. Ekrana giden veri

### 5.1 Makine mesajları

Backend geçerli makine mesajlarını `/stream` (SSE) üzerinden isimsiz olay olarak, Bölüm 2'deki biçimde aktarır.

### 5.2 OEE mesajı

- Aynı `/stream` üzerinden `event: oee` adıyla gider. Makine mesajları isimsiz kaldığı için OEE mesajını tanımayan bir ekran bozulmaz.
- 5 saniyede bir ve oturum başlayınca ya da bitince gönderilir.
- Açık oturum yoksa son oturumun değerleri `session_end` dolu olarak gider. Hiç oturum yoksa OEE mesajı gönderilmez.

```
event: oee
data: {"factory":"Factory_1","line":"Production_Line_1","machine":"Machine_1","ts":1792153500000,"session_start":1792150000000,"session_end":null,"availability":0.8,"performance":1.0,"quality":0.95,"oee":0.76,"total":480,"reject":24,"no_data_seconds":0,"gap_parts":0}
```

| Alan | Tip | Kural |
|---|---|---|
| `factory`, `line`, `machine` | string | Makine mesajıyla aynı |
| `ts` | integer | Hesabın yapıldığı an, Unix zamanı, milisaniye, UTC |
| `session_start` | integer | Oturumun başladığı an, milisaniye |
| `session_end` | integer ya da `null` | Oturumun kapandığı an (son mesajın ts'i). Oturum açıkken `null` |
| `availability` | sayı | 0–1 |
| `performance` | sayı ya da `null` | 0–1. Hesaplanamıyorsa `null` (Bölüm 4.2, özel durumlar) |
| `quality` | sayı ya da `null` | 0–1. Hesaplanamıyorsa `null` |
| `oee` | sayı | 0–1 |
| `total` | integer | Oturumun OEE hesabındaki Toplam |
| `reject` | integer | Oturumun OEE hesabındaki Hatalı |
| `no_data_seconds` | sayı | Oturumdaki veri yok süresi, saniye |
| `gap_parts` | integer | Kesinti adımlarında üretilip OEE dışında kalan parça |

Geçersiz OEE mesajı ekranda atlanır. Ekran çökmez, önceki değerler değişmez.

### 5.3 Ekran kuralları

- Göstergeler 0–1 arası değer alır ve yüzdeye kendisi çevirir.
- Renk: %70 altı kırmızı, %70 ile %85 arası (85 hariç) sarı, %85 ve üstü yeşil. Tam %70 sarı, tam %85 yeşildir.
- A, P, Q göstergeleri ve OEE satırı OEE mesajından beslenir.
- **Kartlar:** Toplam üretim ve Hatalı üretim kartları PLC'nin ham sayacını değil, OEE mesajındaki `total` ve `reject`'i gösterir. Ham sayaçlar birbirinden bağımsız başa döndüğü için hatalı üretim toplamdan büyük görünebilir. Oturumun başlangıç saati kartların yanında yazar.
- `no_data_seconds` ya da `gap_parts` 0'dan büyükse kartta kısa bir not çıkar: veri yok süresi ve kesintide üretilip OEE dışında kalan parça sayısı.
- Oturum kapandıysa (`session_end` dolu) kartlar son oturumu gösterir ve "oturum kapandı" diye belirtir.
- **Son 60 sn:** ts'i son mesajın ts'inden en fazla 60 sn geride olan normal adımların `total_count` artışlarının toplamı.
- 10 saniyeden uzun süre makine mesajı gelmezse ekran "veri gelmiyor" uyarısı gösterir.
- Sahte veri kaynağı OEE mesajını OEE hesaplamadan, sabit örnek değerlerle gönderir.

## 6. Test senaryoları

Tolerans: ±0,1 yüzde puanı (`pytest.approx(0.76, abs=0.001)`).

OEE (10 dakikalık oturum, saniyede bir mesaj, 601 mesaj, fonksiyona planlı süre 600 sn verilir):

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

Oturum ve OEE (Backend):

6. Hatalı, Toplam'dan büyük gelirse hesap çökmez, İyi 0 alınır, Quality 0 olur ve log'a uyarı düşer.
7. Kesintili oturum: 10 dakikalık oturumda makine hep çalışıyor, hatalı yok, ortada 86 sn veri gelmiyor. Planlı süre 600 sn, çalışma süresi 514 sn, veri yok süresi 86 sn, `gap_parts` 86. Availability %85,7, Performance %100, Quality %100, OEE %85,7.
8. Oturumun açılıp kapanması: açık oturum yokken gelen ilk geçerli mesaj yeni bir oturum açar ve oturumun başlangıcı bu mesajın ts'i olur. Son mesajdan sonra 1 saat veri gelmezse oturum son mesajın ts'inde kapanır. Sonra gelen ilk mesaj yeni bir oturum açar.

## 7. Açık konular

- Hafta 5: 32-bit sayaçlar ve PLC çalışma süresi sayacı. PLC'nin yeniden başladığı çalışma süresinin azalmasından kesin anlaşılacak, geçen süre PLC'nin kendi saatinden ölçülecek. Bölüm 3 bu değişiklikle yeniden yazılacak.
- Hafta 5: Sparkplug B akışında veri kesintisi mesaj aralığına göre değil, NDEATH ile sonraki NBIRTH arasına göre belirlenecek. Report by Exception'da makine dururken mesaj gelmez, mesaj aralığına bakan kural bunu kesinti sanar.
- Hafta 11: Operatör ekranından elle oturum başlatıp bitirme eklenebilir. Bu durumda mola ya da uzun bir kesinti de duruş olarak görünür, sektördeki iş emri bazlı OEE'ye yaklaşılır.
- Hafta 10 öncesi: saat kaymasında bir mesajın hangi oturuma sayılacağı (cihazın zamanı mı, backend'in alış zamanı mı) ve ne kadar kaymanın kabul edileceği belirlenecek.

## Değişiklik geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| Hafta 2 | Ekim 2026 | İlk sürüm: alanlar ve tipler, 5'ten büyük artış sıfırlanma sayılır. |
| Hafta 3 | 12 Ekim 2026 | Sınır geçen süreye bağlandı (süre + 4), veri kesintisi (10 sn) ve uzun kesinti (1 saat) eklendi, OEE sözleşmesi ve test senaryoları eklendi, yalnızca `/data` topic'i işlenir. |
| Hafta 4 | 19 Ekim 2026 | Üretim oturumu eklendi: backend veri gelince açar, 1 saat veri gelmezse kapatır. Planlı süre oturumdan gelir. Veri kesintisi planlı süreden düşülmez, "veri yok" olarak gösterilir. Kısa duruş eşiği yok. ts geriye giderse OEE'deki süre 0. Hatalı, Toplam'dan büyükse İyi 0. OEE mesajı (`event: oee`) ve kart kuralları eklendi. Topic tam 4 parçalı olmalı, test mesajları `…/test`'e atılır. Yeni test senaryoları (6–8). |
