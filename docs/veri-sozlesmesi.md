# Veri Sözleşmesi

Makine mesajlarının biçimini, sayaç artışının nasıl hesaplandığını, üretim oturumlarını, OEE'nin nasıl bulunduğunu ve Sparkplug B akışını tanımlar. IoT, Backend ve Frontend aynı kurala bu dosyadan bakar. Kodda bu kurallara referans verirken bu dosyayı gösterin.

**Sürüm:** Hafta 5 (26 Ekim 2026) · **Sorumlu:** Proje Yöneticisi

> Hafta 5'ten itibaren ESP32 Sparkplug B'ye geçer (Bölüm 7). Bölüm 1 ve 2, Bölüm 3.1 ve Bölüm 4.2'deki 10 sn kuralı yedek Python köprüsünün JSON akışı için geçerli kalır. Değişen yerlerde "Hafta 5'ten itibaren" notu var.

> Sayaçlar iki akışta farklı: JSON akışında 16-bit sayaçlar (Bölüm 3.1), Sparkplug akışında 32-bit sayaçlar ve PLC'nin açık kalma süresi `uptime` (Bölüm 3.2, taslak). Kaynak değişince iki sayacın farkı alınmaz (Bölüm 3.3).

> **Hafta 5'te:** OEE ve ekran yedek köprünün JSON akışıyla çalışmaya devam eder. Backend Sparkplug mesajlarını yalnızca çözüp loglar. Sparkplug verisinin veritabanına yazılması ve OEE'ye girmesi Hafta 6'da.

## 1. Topic

```
Factory_1/Production_Line_1/Machine_1/data
```

- Yapı: `<fabrika>/<hat>/<makine>/data`
- Backend yalnızca tam 4 parçalı ve son parçası `data` olan topic'leri işler. Başka topic'lere atılan mesajlar atlanır (ör. `…/Machine_1/test`, `…/Machine_1/deneme/data`).
- Test mesajları `Factory_1/Production_Line_1/Machine_1/test` topic'ine atılır. Bu mesajlar ekrana düşmez.
- Aynı makine için aynı anda tek kaynak yazar: ESP32 ya da yedek Python köprüsü. İki kaynak birlikte yazarsa artış hesapları bozulur.

> **Hafta 5'ten itibaren Bölüm 7.1:** ESP32 bu topic'e değil Sparkplug B topic'lerine yazar. Backend ESP32'yi `spBv1.0/Factory_1/#` aboneliğinden okur. "Yalnızca `/data`" kuralı ve bu bölümün geri kalanı yalnızca yedek köprünün JSON akışı için geçerli kalır.
>
> **Tek kaynak kuralı, Hafta 5 istisnası:** Bu hafta backend Sparkplug mesajlarını yalnızca logladığı için ESP32 (Sparkplug) ve yedek köprü (JSON) aynı anda çalışabilir, ekran köprüden beslenir. Köprünün tek kaynak kontrolü Sparkplug topic'lerini (`spBv1.0/Factory_1/+/Production_Line_1/#`) de dinleyecek şekilde hazırlanır ama Hafta 6'ya kadar kapalı tutulur. Hafta 6'da backend Sparkplug verisini işlemeye başlayınca kontrol açılır ve tek kaynak kuralı iki akış için birlikte geçerli olur.

## 2. Mesaj

Bu bölüm makineden gelen JSON mesajını tanımlar. Backend'in ekrana gönderdiği OEE mesajı Bölüm 5.2'de.

> **Hafta 5'ten itibaren Bölüm 7.2:** ESP32'nin gönderdiği veri bu JSON değil, Sparkplug B metrikleridir. Bu bölüm yedek köprünün JSON mesajı için geçerli kalır. Ekrana giden makine mesajının Sparkplug akışındaki biçimi açık konu (Bölüm 8).

```json
{
  "factory": "Factory_1",
  "line": "Production_Line_1",
  "machine": "Machine_1",
  "ts": 1792153499000,
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

### 3.1 JSON akışı: 16-bit sayaçlar

Bu bölüm yedek Python köprüsünün ve Hafta 5'e kadar ESP32'nin gönderdiği JSON mesajlarındaki 16-bit sayaçlar (HR0, HR1) içindir. Bu sayaçlar PLC'nin yeniden başladığını ve geçen süreyi bilmediği için kural bunları tahmin eder.

Sayaçlar 32767'den sonra 0'a döner, PLC yeniden başlayınca 0'dan başlar. İki sayaç (`total_count` ve `reject_count`) birbirinden bağımsız başa döner ve aşağıdaki adımlardan ayrı ayrı geçer. Süreyle ilgili kararlar ikisi için ortaktır.

Art arda gelen iki geçerli mesaj arası bir **adım**dır. Her adım için:

1. **Süre:** `süre = (yeni ts − eski ts) / 1000`, yukarı yuvarlanır. 1'den küçükse (ts ilerlemediyse ya da geriye gittiyse) 1 alınır. **Bu süre yalnızca sayaç kuralı içindir:** sıfırlanma sınırı (`süre + 4`), uzun kesinti ve veri kesintisi kararları bununla verilir. Aynı adımın OEE'deki süresi gerçek ts farkıdır ve ts ilerlemediyse ya da geriye gittiyse 0 alınır (Bölüm 4.2). Yani ts geriye giden bir adım sayaç için 1 sn, OEE için 0 sn sayılır.
2. **Ham artış:** `ham = ((yeni − eski) % 32767 + 32767) % 32767`. Bu formülde 32767 ile 0 aynı sayılır, böylece başa dönme doğru hesaplanır.
3. **Uzun kesinti:** `süre > 3600` ise üretim bilinmiyor. Adım OEE'ye, "son 60 sn"ye ve toplam üretime girmez. Adım burada biter. Oturum bu durumda zaten kendiliğinden kapanmış olur (Bölüm 4.1).
4. **Sıfırlanma:** `ham > süre + 4` ise sayaç sıfırlanmış kabul edilir, artış 0 olur. Aksi hâlde artış = ham. Makine saniyede en fazla 1 parça yapar. 4 okuma zamanlaması için paydır.
5. **Veri kesintisi:** `süre > 10` ise adım veri kesintisidir. Artış toplam üretime eklenir ama OEE'nin Toplam ve Hatalı'sına ve "son 60 sn"ye girmez. Adımın süresi planlı sürede kalır ve "veri yok" sayılır (Bölüm 4.2). Aksi hâlde adım normaldir ve her yerde kullanılır. **Hafta 5'ten itibaren** Sparkplug akışında veri kesintisi mesaj aralığına göre değil Bölüm 7.3'e göre belirlenir.

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
| ts ilerlemedi | 1517 → 1518 | 0 → 1 sn | Artış 1, normal. OEE'deki süresi 0 |
| ts geriye gitti | 1517 → 1518 | −0,5 → 1 sn | Artış 1, normal. OEE'deki süresi 0 |

### 3.2 Sparkplug akışı: 32-bit sayaçlar ve `uptime` (taslak)

ESP32'nin Sparkplug akışında `total_count`, `reject_count` (UInt32) ve `uptime` (UInt32, PLC açıldığından beri geçen saniye) aynı Modbus okumasından gelir (Bölüm 7.2). Art arda gelen iki değer arası yine bir adımdır. `uptime` PLC'nin yeniden başladığını ve geçen süreyi kesin söylediği için 3.1'deki tahmin kuralları bu akışta kullanılmaz.

1. **Yeniden başlama:** Yeni `uptime` eskisinden küçükse PLC yeniden başlamıştır. Değilse yeniden başlamamıştır.
2. **Artış (yeniden başlama yoksa):** `artış = yeni − eski`. Sayaç 32-bit olduğu için pratikte başa dönmez (saniyede 1 parçayla 136 yıl). Yine de formül `(yeni − eski) mod 2^32` olarak yazılır. İki sayaç aynı `uptime` ile değerlendirildiği için birbirinden bağımsız başa dönme sorunu da kalmaz.
3. **Artış (yeniden başlama varsa):** Sayaçlar yeniden başlatmada 0'dan başlıyorsa artış yeni değerdir. Son okumadan yeniden başlatmaya kadar üretilip okunamayan parçalar bilinemez. Sayaçlar korunuyorsa (retain) artış yine `yeni − eski`'dir. Hangisinin geçerli olduğu PLC programına bağlı ve Yağmur'un bilgisiyle kesinleşecek (Bölüm 8).
4. **Uzun ara:** `uptime` azalmadıkça adım ne kadar uzun olursa olsun artış kesin bilinir. 3.1'deki "sıfırlanma" (`süre + 4`) ve "üretim bilinmiyor" (1 saat) kuralları bu akışta yoktur.
5. **Geçen süre:** `yeni uptime − eski uptime`, PLC'nin kendi saatiyle ölçülen süredir. ESP32'nin ya da Wokwi'nin saati duraksasa bile doğru kalır. OEE'deki sürelerin (Bölüm 4.2) de ts yerine bu süreye geçip geçmeyeceği Sparkplug OEE kuralıyla birlikte kararlaştırılacak (Bölüm 8).

| Durum | `uptime` eski → yeni | Sayaç eski → yeni | Sonuç |
|---|---|---|---|
| Normal | 1000 → 1001 | 5000 → 5001 | Artış 1 |
| Duruş | 1000 → 1060 | 5000 → 5000 | Artış 0, geçen süre 60 sn |
| Uzun ara, yeniden başlama yok | 1000 → 8200 | 5000 → 10760 | Artış 5760, kesin |
| PLC yeniden başladı, sayaçlar sıfırlanıyor | 8200 → 5 | 10760 → 3 | Artış 3, öncesi bilinemez |
| PLC yeniden başladı, sayaçlar korunuyor | 8200 → 5 | 10760 → 10763 | Artış 3 |

### 3.3 Kaynak değişimi

Bir makinenin art arda gelen iki mesajı farklı kaynaktan gelebilir: ESP32'nin Sparkplug akışı ve yedek köprünün JSON akışı. Kaynak topic'ten anlaşılır (`spBv1.0/…` ya da `…/data`). İki akışın sayaçları farklıdır (16-bit ve 32-bit), bu yüzden:

- Kaynağın değiştiği adımda sayaç farkı alınmaz. Adımın üretimi bilinmiyor sayılır. Adım OEE'ye, "son 60 sn"ye ve toplam üretime girmez.
- Adımın süresi planlı sürede kalır ve veri yok sayılır (Bölüm 4.2). Oturum kapanmaz (Bölüm 4.1).
- Sonraki adımlar yeni kaynağın kuralıyla hesaplanır (3.1 ya da 3.2).

Bu kural Hafta 6'da backend Sparkplug verisini işlemeye başlayınca devreye girer. Fonksiyon Hafta 5'te yazılır ve test edilir (test 13).

## 4. Üretim oturumu ve OEE

### 4.1 Üretim oturumu

Ekibin çalışma saatleri sabit olmadığı için planlı süreyi vardiya takvimi değil üretim oturumu belirler. Oturumu backend kendisi yönetir, kimsenin oturum başlatması ya da bitirmesi gerekmez. Simülasyonda makine yalnızca biz çalıştırınca var olduğu için verinin aktığı süreyi planlı süre sayıyoruz.

- Makineden geçerli bir mesaj geldiğinde o makinenin açık oturumu yoksa backend yeni bir oturum açar. Oturumun başlangıcı bu mesajın ts'idir.
- 1 saatten uzun veri gelmezse oturum son mesajın ts'inde kendiliğinden kapanır. Sonra gelen ilk mesaj yeni bir oturum açar. Bu yüzden 1 saati aşan bir kesinti hiçbir oturumun içinde kalmaz.
- Aynı makinede aynı anda tek açık oturum olur.
- Kaynak değişimi (ESP32 ile yedek köprü arasında geçiş) oturumu kapatmaz. Geçiş adımı veri yok sayılır (Bölüm 3.3).
- Oturum kaydı: başlangıç ve bitiş (oturum açıkken boş).
- Veri 10 sn'den uzun kesilirse oturum 1 saat boyunca açık kalır ve planlı süre şu ana kadar işler. Bu yüzden ekrandaki Availability düşer. Oturum kapanınca planlı süre son mesaja çekilir ve değerler düzelir.
- Elle oturum başlatıp bitirme (iş emri gibi) Hafta 11'de operatör ekranıyla eklenebilir (Bölüm 8).

### 4.2 OEE hesabı

Hesap, bir oturumun mesajları üzerinden yapılır. OEE fonksiyonları MQTT'ye ve veritabanına bağlı değildir. Mesaj listesini ve planlı süreyi dışarıdan alır. Backend hesabı her seferinde veritabanındaki mesajlardan yapar, bellekte biriktirmez.

- Her mesajın `status` değeri, bir sonraki mesaja kadar geçen süre için geçerlidir.
- **Planlı süre** = oturumun başından sonuna kadar geçen süre. Oturum kapandıysa sonu `session_end`'dir. Oturum açıksa sonu son mesajın ts'idir, ama son mesajdan bu yana 10 sn'den uzun süre geçtiyse şu andır ve aradaki süre veri yok sayılır. Böylece saniyede bir gelen verinin iki mesajı arasındaki an veri yok görünmez ve değerler mesajlar arasında oynamaz. Planlı duruş ve kısa duruş eşiği yoktur, bütün duruşlar Availability'den düşer.
- **Çalışma süresi** = `status` true olan normal adımların süresi. Buradaki süre gerçek ts farkıdır: ts ilerlemediyse ya da geriye gittiyse adımın süresi 0 alınır (sayaç kuralındaki 1 sn burada kullanılmaz, Bölüm 3.1 adım 1).
- **Veri yok süresi** = planlı süre − normal adımların süresi. Kesinti adımlarını, kaynak değişimi adımını (Bölüm 3.3) ve oturum açıkken son mesajdan bu yana 10 sn'den uzun süre geçtiyse o süreyi kapsar. Planlı sürede kalır ama çalışma süresine girmez: ne olduğunu bilmediğimiz süreyi çalıştı ya da durdu sayamayız.
- **İdeal çevrim süresi** = 1 sn (PLC çalışırken saniyede 1 parça üretir).
- **Toplam** = normal adımlardaki `total_count` artışları. **Hatalı** = normal adımlardaki `reject_count` artışları. **İyi** = Toplam − Hatalı. İyi eksi çıkarsa 0 alınır.
- Kesinti adımlarındaki `total_count` artışları OEE'ye girmez. Bu parçalar OEE mesajında `gap_parts` olarak gösterilir ve veritabanındaki toplam üretime eklenir.

> **Hafta 5'ten itibaren Bölüm 7.3:** Sparkplug akışında değer değişmedikçe mesaj gelmez (Report by Exception, Hafta 6). Makine dururken mesaj gelmemesi kesinti değildir. Bu yüzden bu akışta "son mesajdan bu yana 10 sn" ve "adım süresi 10 sn'den uzun" kuralları kullanılmaz. Veri yok süresi NDEATH ile sonraki NBIRTH arası ve bir makine için DDEATH ile sonraki DBIRTH arasıdır. 10 sn kuralları yedek köprünün JSON akışı için geçerli kalır.

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

Backend geçerli makine mesajlarını `/stream` (SSE) üzerinden isimsiz olay olarak, Bölüm 2'deki biçimde aktarır. **Hafta 5'ten itibaren** ESP32'nin Sparkplug akışından gelen verinin ekrana hangi biçimde gideceği açık konu (Bölüm 8).

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
| `no_data_seconds` | integer | Oturumdaki veri yok süresi, saniye. Tam sayıya yuvarlanır, eksi olamaz |
| `gap_parts` | integer | Kesinti adımlarında üretilip OEE dışında kalan parça |

Zaman alanları (`ts`, `session_start`, `session_end`), `total`, `reject`, `gap_parts` ve `no_data_seconds` tam sayı gönderilir. Python'da zaman için `int(time.time() * 1000)` kullanılabilir. Ondalıklı ya da eksi bir değer gelirse ekran mesajı atlar.

Geçersiz OEE mesajı ekranda atlanır. Ekran çökmez, önceki değerler değişmez.

### 5.3 Ekran kuralları

- Göstergeler 0–1 arası değer alır ve yüzdeye kendisi çevirir.
- Renk: %70 altı kırmızı, %70 ile %85 arası (85 hariç) sarı, %85 ve üstü yeşil. Tam %70 sarı, tam %85 yeşildir.
- A, P, Q göstergeleri ve OEE satırı OEE mesajından beslenir.
- **Kartlar:** Toplam üretim ve Hatalı üretim kartları PLC'nin ham sayacını değil, OEE mesajındaki `total` ve `reject`'i gösterir. Ham sayaçlar birbirinden bağımsız başa döndüğü için hatalı üretim toplamdan büyük görünebilir. Oturumun başlangıç saati kartların yanında yazar.
- `no_data_seconds` ya da `gap_parts` 0'dan büyükse kartta kısa bir not çıkar: veri yok süresi ve kesintide üretilip OEE dışında kalan parça sayısı.
- Oturum kapandıysa (`session_end` dolu) kartlar son oturumu gösterir ve "oturum kapandı" diye belirtir.
- **Son 60 sn:** ts'i son mesajın ts'inden en fazla 60 sn geride olan normal adımların `total_count` artışlarının toplamı.
- 10 saniyeden uzun süre makine mesajı gelmezse ekran "veri gelmiyor" uyarısı gösterir. Hafta 6'da Report by Exception gelince bu uyarı ekranın kendi zamanlayıcısından değil, backend'in bildirdiği bağlantı durumundan beslenecek.
- Sahte veri kaynağı OEE mesajını OEE hesaplamadan, sabit örnek değerlerle gönderir.

## 6. Test senaryoları

Tolerans: ±0,1 yüzde puanı (`pytest.approx(0.76, abs=0.001)`).

OEE (10 dakikalık oturum, saniyede bir mesaj, 601 mesaj, fonksiyona planlı süre 600 sn verilir):

| # | Senaryo | Çalışma | Parça | Hatalı | A | P | Q | OEE |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal | 480 sn | 480 | 24 | %80 | %100 | %95 | %76 |
| 2 | Düşük kullanılabilirlik | 240 sn | 240 | 12 | %40 | %100 | %95 | %38 |
| 3 | Yüksek hata | 480 sn | 480 | 120 | %80 | %100 | %75 | %60 |

Sayaç, JSON akışı (Bölüm 3.1, Backend ve Frontend aynı testleri çalıştırır):

1. 32766 → 32767 → 0 → 1 dizisinde toplam artış 2.
2. 32766'dan 1 sn sonra 0 gelirse artış 1.
3. 1517'den 1 sn sonra 3 gelirse artış 0.
4. 1517'den 86 sn sonra 1586 gelirse artış 69, adım kesinti ve OEE'ye girmez.
5. 1517'den 2 saat sonra 40 gelirse artış bilinmiyor (ör. `None`), toplam üretime eklenmez.

Oturum ve OEE (Backend):

6. Hatalı, Toplam'dan büyük gelirse hesap çökmez, İyi 0 alınır, Quality 0 olur ve log'a uyarı düşer.
7. Kesintili oturum: 10 dakikalık oturumda makine hep çalışıyor, hatalı yok, ortada 86 sn veri gelmiyor. Planlı süre 600 sn, çalışma süresi 514 sn, veri yok süresi 86 sn, `gap_parts` 86. Availability %85,7, Performance %100, Quality %100, OEE %85,7.
8. Oturumun açılıp kapanması: açık oturum yokken gelen ilk geçerli mesaj yeni bir oturum açar ve oturumun başlangıcı bu mesajın ts'i olur. Son mesajdan sonra 1 saat veri gelmezse oturum son mesajın ts'inde kapanır. Sonra gelen ilk mesaj yeni bir oturum açar.
9. Açık oturumda hesap zamanı: Test 1'deki oturum açıkken son mesajdan 3 sn sonra hesaplanırsa planlı süre 600 sn, veri yok süresi 0, OEE %76. Son mesajdan 15 sn sonra hesaplanırsa planlı süre 615 sn, veri yok süresi 15 sn, Availability %78,0, OEE %74,1.

Sayaç, Sparkplug akışı (Bölüm 3.2, taslak, Backend):

10. `uptime` 1000 → 1001, `total_count` 5000 → 5001: artış 1.
11. `uptime` 1000 → 8200 (2 saat), `total_count` 5000 → 10760: artış 5760, "üretim bilinmiyor" sayılmaz.
12. `uptime` 8200 → 5, `total_count` 10760 → 3: PLC yeniden başlamıştır. Sayaçlar sıfırlanıyorsa artış 3, korunuyorsa sayaç 10763 gelir ve artış yine 3 olur. Beklenen değer Bölüm 3.2 adım 3 kesinleşince yazılacak.

Kaynak değişimi ve Sparkplug kesintisi (Bölüm 3.3 ve 7.3, Backend):

13. JSON akışından son mesaj `total_count` 1517 ile gelir. 30 sn sonra Sparkplug akışından ilk mesaj `total_count` 5000, `uptime` 1000 ile gelir. Adımın artışı bilinmiyor (ör. `None`), toplam üretime ve OEE'ye eklenmez. Adımın 30 sn'si veri yok sayılır, oturum kapanmaz. Sonraki Sparkplug mesajı `uptime` 1001, `total_count` 5001 ile gelirse artış 1.
14. `Machine_1` için DDEATH ile sonraki DBIRTH arasında 120 sn varsa bu 120 sn veri yok sayılır. Makine dururken (`status` false) 5 dakika DDATA gelmemesi veri yok değildir, 5 dakika duruş sayılır. NDEATH ile sonraki NBIRTH arası da veri yok sayılır (NDEATH'in zamanı Bölüm 8'deki karara göre).

## 7. Sparkplug B

Bu bölüm ESP32'nin Sparkplug B akışını tanımlar. Yedek Python köprüsü JSON'da kalır (Bölüm 1–2).

> **Durum: taslak.** Bölüm 7.2'deki Modbus adresleri, word sırası ve duruş nedeni kodları dolana ve Clean Session ile NDEATH'in QoS ve retain kuralları Sparkplug 3.0 spesifikasyonundan teyit edilene kadar bu bölüm karara bağlanmış sayılmaz (Bölüm 8).

### 7.1 Topic

```
spBv1.0/Factory_1/NBIRTH/Production_Line_1
spBv1.0/Factory_1/NDEATH/Production_Line_1
spBv1.0/Factory_1/NCMD/Production_Line_1
spBv1.0/Factory_1/DBIRTH/Production_Line_1/Machine_1
spBv1.0/Factory_1/DDATA/Production_Line_1/Machine_1
spBv1.0/Factory_1/DDEATH/Production_Line_1/Machine_1
```

| Sparkplug | ISA-95 | Bizde |
|---|---|---|
| Grup (`group_id`) | Fabrika | `Factory_1` |
| Edge node (`edge_node_id`) | Hat | `Production_Line_1` (hattın ESP32'si) |
| Cihaz (`device_id`) | Makine | `Machine_1`, Hafta 7'de `Machine_2` |

- Adlar ISA-95 ağacındaki ve JSON mesajındaki adlarla birebir aynıdır.
- Bir hattın tek ESP32'si vardır. Hattın bütün makinelerini (OpenPLC'lerini) o okur ve her makineyi ayrı cihaz olarak yayınlar. Hafta 7'de ikinci makine, aynı ESP32'ye ikinci bir OpenPLC olarak eklenir.
- Backend `spBv1.0/Factory_1/#` topic'ine abone olur. `spBv1.0/+/+/+/+` yalnızca cihaz topic'lerini yakalar, NBIRTH ve NDEATH'i kaçırır.

### 7.2 Metrikler

Edge node (NBIRTH, NDEATH):

| Alias | Metrik | Tip | Kural |
|---|---|---|---|
| 0 | `bdSeq` | UInt64 | Her yeni MQTT bağlantısında 1 artar. NBIRTH ve NDEATH'te aynı değer |
| 1 | `Node Control/Rebirth` | Boolean | NBIRTH'te `false`. Backend NCMD ile `true` gönderirse ESP32 NBIRTH ve DBIRTH'leri yeniden gönderir |

Makine (DBIRTH, DDATA), `Machine_1`:

| Alias | Metrik | Tip | Kaynak |
|---|---|---|---|
| 10 | `status` | Boolean | Coil 0, `true` = makine çalışıyor |
| 11 | `total_count` | UInt32 | 32-bit toplam üretim sayacı. Modbus adresi: **doldurulacak** |
| 12 | `reject_count` | UInt32 | 32-bit hatalı üretim sayacı. Modbus adresi: **doldurulacak** |
| 13 | `uptime` | UInt32 | PLC açıldığından beri geçen saniye. Modbus adresi: **doldurulacak** |
| 14 | `stop_reason` | UInt16 | Duruş nedeni kodu, çalışırken 0. Modbus adresi: **doldurulacak** |

Duruş nedeni kodları: **doldurulacak** (0 = duruş yok).

32-bit değerlerde word sırası (hangi register'ın önce geldiği): **doldurulacak**.

- Dört değer (`total_count`, `reject_count`, `uptime`, `stop_reason`) ardışık register'larda durur, ESP32 hepsini tek okumada alır. Eski 16-bit sayaçlar (HR0, HR1) yedek köprünün JSON akışı için yerinde kalır.
- Alias'lar edge node genelinde benzersizdir. Makine n'nin alias'ları n × 10'dan başlar (`Machine_2`: 20–24).
- Metrik adları JSON alanlarıyla aynı tutuldu. `uptime` PLC'nin açık kalma süresidir, OEE'deki çalışma süresiyle karıştırılmasın.
- Sayaç artışı Bölüm 3.2'ye göre hesaplanır.
- Payload ve metrik zamanları ESP32'nin NTP saatinden alınır: Unix zamanı, milisaniye, UTC. Metrik zamanı Modbus okumasının anıdır.

### 7.3 Bağlantı ve mesaj kuralları

- NDEATH, ESP32'nin MQTT bağlantısının Will mesajıdır (QoS 1, retain yok). Sparkplug 3.0'a göre Clean Session açık (`true`) olur (üçü de teyit edilecek, Bölüm 8). Will mesajı ikili (protobuf) olduğu için ikili Will destekleyen bir MQTT kütüphanesi kullanılır (ör. espMqttClient). PubSubClient Will mesajını metin olarak gönderir ve protobuf'u ilk 0 baytında keser. NDEATH Hafta 6'da gönderilir.
- ESP32 bağlanınca önce NBIRTH, sonra her makine için DBIRTH gönderir. `seq` her mesajda 1 artar, 255'ten sonra 0'a döner.
- DDATA yalnızca değişen metrikleri taşır (Report by Exception, Hafta 6). `uptime` tek başına mesaj tetiklemez, başka bir metrik değişince onunla birlikte gider.
- Bir makinenin PLC'si okunamazsa yalnızca o makine için DDEATH gönderilir. Okuma düzelince o makine için DBIRTH yeniden gönderilir.
- **Veri kesintisi:** Sparkplug akışında veri kesintisi mesaj aralığına göre değil, NDEATH ile sonraki NBIRTH arasına göre belirlenir. Bir makine için DDEATH ile sonraki DBIRTH arası da o makine için veri yok sayılır. Bu süreler Bölüm 4.2'deki veri yok süresine girer.
- Primary Host (STATE) şimdilik kullanılmıyor.

## 8. Açık konular

- Hafta 5: 32-bit sayaç kuralı (Bölüm 3.2) taslak. PLC yeniden başlayınca sayaçların 0'dan mı başladığı yoksa korunduğu mu Yağmur'un PLC programıyla kesinleşecek (adım 3 ve test 12).
- Hafta 5: Sparkplug akışında OEE'deki sürelerin ts farkından mı yoksa `uptime` farkından mı alınacağı (Bölüm 3.2 adım 5, Bölüm 4.2).
- Hafta 5: Bölüm 7.2'deki Modbus adresleri, 32-bit değerlerin word sırası ve duruş nedeni kodları Yağmur'un README'sinden doldurulacak. Dolana kadar Bölüm 7 taslaktır.
- Hafta 5: Clean Session ile NDEATH'in QoS ve retain kuralları Sparkplug 3.0 spesifikasyonundan teyit edilecek (Bölüm 7.3).
- Hafta 5: Sparkplug akışında ekrana giden makine mesajının biçimi (Bölüm 5.1). Sayaçlar 32-bit olacağı için Bölüm 2'deki 0–32767 aralığı tutmaz. Ekranın "son 60 sn" hesabı Hafta 6'da backend'e taşınana kadar bu mesajı kullanır.
- Hafta 6: Yedek köprünün tek kaynak kontrolü Sparkplug topic'lerini (`spBv1.0/Factory_1/+/Production_Line_1/#`) de dinleyecek şekilde Hafta 5'te hazırlanır, Hafta 6'da açılır (Bölüm 1).
- Hafta 6: Report by Exception'da makine dururken mesaj gelmez. Bu yüzden "1 saat veri gelmezse oturum kapanır" kuralı (Bölüm 4.1) Sparkplug akışında bağlantı açıkken kullanılamaz. Sparkplug akışında oturumun ne zaman kapanacağı belirlenecek.
- Hafta 6: Tailscale koparsa ESP32 yerel broker'a bağlı kaldığı için NDEATH gönderilmez. Merkezi broker'daki köprü (bridge) bağlantı durumu da veri kesintisi kaynağı olarak eklenmeli (Bölüm 7.3).
- Hafta 6: NDEATH Will mesajı olduğu için bağlantı kurulurken broker'a bırakılır, içindeki zaman kopma anını göstermez. Sparkplug kesintisinin başlangıcı olarak hangi zamanın alınacağı (son mesajın ts'i ya da NDEATH'in backend'e ulaştığı an) belirlenecek (test 14).
- Hafta 11: Operatör ekranından elle oturum başlatıp bitirme eklenebilir. Bu durumda mola ya da uzun bir kesinti de duruş olarak görünür, sektördeki iş emri bazlı OEE'ye yaklaşılır.
- Hafta 10 öncesi: saat kaymasında bir mesajın hangi oturuma sayılacağı (cihazın zamanı mı, backend'in alış zamanı mı) ve ne kadar kaymanın kabul edileceği belirlenecek.

## Değişiklik geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| Hafta 2 | Ekim 2026 | İlk sürüm: alanlar ve tipler, 5'ten büyük artış sıfırlanma sayılır. |
| Hafta 3 | 12 Ekim 2026 | Sınır geçen süreye bağlandı (süre + 4), veri kesintisi (10 sn) ve uzun kesinti (1 saat) eklendi, OEE sözleşmesi ve test senaryoları eklendi, yalnızca `/data` topic'i işlenir. |
| Hafta 4 | 19 Ekim 2026 | Üretim oturumu eklendi: backend veri gelince açar, 1 saat veri gelmezse kapatır. Planlı süre oturumdan gelir. Veri kesintisi planlı süreden düşülmez, "veri yok" olarak gösterilir. Kısa duruş eşiği yok. ts geriye giderse OEE'deki süre 0. Hatalı, Toplam'dan büyükse İyi 0. OEE mesajı (`event: oee`) ve kart kuralları eklendi. Topic tam 4 parçalı olmalı, test mesajları `…/test`'e atılır. Yeni test senaryoları (6–8). |
| Hafta 4 düzeltme | 20 Ekim 2026 | Açık oturumda planlı süre son mesaja kadar sayılır. Son mesajdan bu yana 10 sn'den uzun süre geçtiyse şu ana kadar sayılır ve aradaki süre veri yok olur. `no_data_seconds` tam sayı. Zaman alanlarının tam sayı olması vurgulandı. Test 9 eklendi. |
| Hafta 5 | 26 Ekim 2026 | Sparkplug B bölümü taslak olarak eklendi (Bölüm 7): fabrika = grup, hat = edge node, makine = cihaz, metrik adları, tipleri ve alias'ları. Modbus adresleri, word sırası ve duruş nedeni kodları bekleniyor. Dört yeni değer ardışık register'larda durur. Sparkplug akışında veri kesintisi NDEATH ile sonraki NBIRTH (makine için DDEATH ile DBIRTH) arasına göre belirlenir, bu açık konu kapandı. Bölüm 3 bölündü: 3.1 JSON akışındaki 16-bit sayaçlar (eski kural aynen), 3.2 Sparkplug akışındaki 32-bit sayaçlar ve `uptime` (taslak), 3.3 kaynak değişimi (sayaç farkı alınmaz, geçiş adımı veri yok, oturum sürer). Testler 10–14. Bu hafta backend Sparkplug'ı yalnızca loglar, ESP32 ve yedek köprü aynı anda çalışabilir (Bölüm 1), köprünün tek kaynak kontrolü Hafta 6'da açılır. Bölüm 1, 2, 3, 4.1, 4.2, 5.1 ve 5.3'e Hafta 5 notları eklendi. Bölüm 3.1 adım 1'de sayaç süresiyle OEE süresinin farkı açıkça yazıldı. Bölüm 2'deki örnek zaman Ekim 2026'ya alındı. Açık konular Bölüm 8 oldu, yeni açık konular eklendi. |
