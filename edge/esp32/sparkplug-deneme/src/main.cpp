// Hafta 4 - Sparkplug B denemesi (canli sisteme BAGLI DEGIL)
//
// Eclipse Tahu C kutuphanesi (nanopb tabanli Protobuf) ile ornek bir NBIRTH
// mesaji olusturur, Protobuf'a kodlar ve boyutunu Wokwi Terminal'e yazar.
// Wi-Fi, Modbus ve MQTT yok; gercek gecis Hafta 5'te yapilacak.
#include <Arduino.h>
#include <sys/time.h>

// Tahu'nun hata ayiklama ciktilari ("Add simple metric..." vb.) kutuphanede
// acik geliyor; kutuphaneyi degistirmemek icin oldugu gibi biraktik.
#include <tahu.h>

// Sparkplug B topic yapisi: spBv1.0/<grup>/<mesaj tipi>/<edge node>[/<cihaz>]
// Hafta 5'te kesinlesecek ornek adlar:
const char *GROUP_ID = "Factory_1";
const char *EDGE_NODE_ID = "Production_Line_1";

// Metrik takma adlari (alias): NBIRTH'te ad + alias birlikte gider,
// sonraki NDATA/DDATA mesajlarinda yalnizca alias gonderilir (daha kisa).
enum : uint64_t {
  ALIAS_BDSEQ = 0,
  ALIAS_REBIRTH = 1,
  ALIAS_STATUS = 2,
  ALIAS_TOTAL = 3,
  ALIAS_REJECT = 4,
};

uint64_t bdSeq = 0;  // her yeni MQTT oturumunda (NBIRTH/NDEATH cifti) 1 artar

static void hexDump(const uint8_t *buf, size_t len) {
  for (size_t i = 0; i < len; i++) {
    Serial.printf("%02X ", buf[i]);
    if ((i + 1) % 16 == 0) Serial.println();
  }
  Serial.println();
}

void buildAndPrintNbirth() {
  org_eclipse_tahu_protobuf_Payload payload;

  // NBIRTH her zaman seq = 0 ile baslar.
  reset_sparkplug_sequence();
  get_next_payload(&payload);  // timestamp + seq doldurulur

  // Zorunlu metrikler
  add_simple_metric(&payload, "bdSeq", true, ALIAS_BDSEQ,
                    METRIC_DATA_TYPE_UINT64, false, false, &bdSeq, sizeof(bdSeq));
  bool rebirth = false;
  add_simple_metric(&payload, "Node Control/Rebirth", true, ALIAS_REBIRTH,
                    METRIC_DATA_TYPE_BOOLEAN, false, false, &rebirth, sizeof(rebirth));

  // Makine metrikleri (ornek degerler)
  bool status = true;
  int32_t total = 1234;
  int32_t reject = 61;
  add_simple_metric(&payload, "Machine_1/status", true, ALIAS_STATUS,
                    METRIC_DATA_TYPE_BOOLEAN, false, false, &status, sizeof(status));
  add_simple_metric(&payload, "Machine_1/total_count", true, ALIAS_TOTAL,
                    METRIC_DATA_TYPE_INT32, false, false, &total, sizeof(total));
  add_simple_metric(&payload, "Machine_1/reject_count", true, ALIAS_REJECT,
                    METRIC_DATA_TYPE_INT32, false, false, &reject, sizeof(reject));

  uint8_t buf[256];
  ssize_t len = encode_payload(buf, sizeof(buf), &payload);

  Serial.printf("[Sparkplug] topic: spBv1.0/%s/NBIRTH/%s\n", GROUP_ID, EDGE_NODE_ID);
  if (len < 0) {
    Serial.println("[Sparkplug] HATA: kodlama basarisiz");
  } else {
    Serial.printf("[Sparkplug] NBIRTH: %u metrik, seq=%llu, bdSeq=%llu\n",
                  (unsigned)payload.metrics_count,
                  (unsigned long long)payload.seq, (unsigned long long)bdSeq);
    Serial.printf("[Sparkplug] Protobuf boyutu: %d bayt\n", (int)len);
    hexDump(buf, (size_t)len);

    // Karsilastirma: ayni bilgi bizim JSON'umuzda kac bayt?
    const char *json =
        "{\"factory\":\"Factory_1\",\"line\":\"Production_Line_1\","
        "\"machine\":\"Machine_1\",\"ts\":1760180400000,\"status\":true,"
        "\"total_count\":1234,\"reject_count\":61}";
    Serial.printf("[Karsilastirma] JSON mesajimiz: %u bayt\n", (unsigned)strlen(json));

    // Kodlanmis mesaji geri cozerek dogrula.
    org_eclipse_tahu_protobuf_Payload decoded;
    memset(&decoded, 0, sizeof(decoded));
    if (decode_payload(&decoded, buf, (size_t)len) >= 0) {
      Serial.printf("[Dogrulama] cozuldu: %u metrik\n", (unsigned)decoded.metrics_count);
      free_payload(&decoded);
    } else {
      Serial.println("[Dogrulama] HATA: cozulemedi");
    }
  }
  free_payload(&payload);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  // Ornek mesajda mantikli bir zaman gorunsun diye sabit bir saat ayarla
  // (bu denemede NTP yok).
  struct timeval tv = {1760180400, 0};
  settimeofday(&tv, nullptr);

  Serial.println("[Sparkplug] Eclipse Tahu + nanopb denemesi");
  buildAndPrintNbirth();
  Serial.printf("[Bellek] bos heap: %u bayt\n", (unsigned)ESP.getFreeHeap());
}

void loop() { delay(1000); }
