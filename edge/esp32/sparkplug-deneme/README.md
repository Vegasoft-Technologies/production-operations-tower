# Sparkplug B denemesi (Hafta 4)

**Canlı sisteme bağlı değil.** Sadece Sparkplug B kütüphanesinin ESP32'de derlendiğini ve örnek bir NBIRTH mesajı oluşturabildiğini gösterir. Gerçek geçiş Hafta 5'te yapılacak.

## Ne yapar?

1. Eclipse Tahu C kütüphanesiyle (Protobuf için nanopb) örnek bir **NBIRTH** mesajı oluşturur.
2. Mesajı Protobuf'a kodlar, boyutunu ve baytlarını Wokwi Terminal'e yazar.
3. Aynı bilginin bizim JSON mesajımızda kaç bayt tuttuğunu karşılaştırma için yazar.
4. Kodlanan mesajı geri çözerek doğrular.

NBIRTH içindeki metrikler (ad + alias):

| Alias | Metrik | Tip |
|---|---|---|
| 0 | bdSeq | UInt64 |
| 1 | Node Control/Rebirth | Boolean |
| 2 | Machine_1/status | Boolean |
| 3 | Machine_1/total_count | Int32 |
| 4 | Machine_1/reject_count | Int32 |

Örnek topic: `spBv1.0/Factory_1/NBIRTH/Production_Line_1`. Grup ve edge node adları Hafta 5'te kesinleşecek.

## Çalıştırma

1. VS Code'da **File → Open Folder** ile bu klasörü (`edge/esp32/sparkplug-deneme`) aç.
2. Alt çubuktaki **✓ (Build)** ile derle.
3. **F1 → Wokwi: Start Simulator**.

Beklenen çıktı (Tahu'nun kendi hata ayıklama satırları arasında):

```
[Sparkplug] topic: spBv1.0/Factory_1/NBIRTH/Production_Line_1
[Sparkplug] NBIRTH: 5 metrik, seq=0, bdSeq=0
[Sparkplug] Protobuf boyutu: 179 bayt
[Karsilastirma] JSON mesajimiz: 142 bayt
[Dogrulama] cozuldu: 5 metrik
```

NBIRTH, JSON'dan büyük çıkıyor çünkü metrik adlarını ve veri tiplerini bir kez tam olarak taşıyor. Sonraki DDATA mesajlarında yalnızca alias ve değişen değerler gider, bu yüzden çok daha kısa olur.

## Kütüphane

`lib/tahu/` altında Eclipse Tahu'nun C çekirdeği **değiştirilmeden** kopyalandı (kaynak ve lisans için `lib/tahu/README.md`). Tahu'nun Protobuf yapıları dinamik bellek kullandığı için `platformio.ini`'de `-DPB_ENABLE_MALLOC` tanımlı.
