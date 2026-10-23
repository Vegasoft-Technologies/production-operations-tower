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

// ---------------------------------------------------------------------------
// Dogrulama: cozulen mesaji alan alan orijinal payload'la karsilastir.
// Not: Tahu'nun print_payload ciktisi ESP32'de alias/timestamp'i yanlis
// gosteriyor (64-bit sayilari %ld ile yaziyor, ESP32'de long 32-bit). Bu
// yuzden 64-bit degerleri burada %llu ve (unsigned long long) ile yaziyoruz.
// ---------------------------------------------------------------------------
typedef org_eclipse_tahu_protobuf_Payload_Metric Metric;

static int hataSayisi = 0;

static void hata(const char *alan, int i, unsigned long long beklenen,
                 unsigned long long gelen) {
  hataSayisi++;
  if (i >= 0) {
    Serial.printf("[Dogrulama] HATA: metric[%d].%s farkli (beklenen %llu, gelen %llu)\n",
                  i, alan, beklenen, gelen);
  } else {
    Serial.printf("[Dogrulama] HATA: %s farkli (beklenen %llu, gelen %llu)\n",
                  alan, beklenen, gelen);
  }
}

// Metrik degerini (oneof) metin olarak yazar.
static void degerYaz(const Metric &m, char *out, size_t n) {
  switch (m.which_value) {
    case org_eclipse_tahu_protobuf_Payload_Metric_int_value_tag:
      snprintf(out, n, "%ld", (long)(int32_t)m.value.int_value);
      break;
    case org_eclipse_tahu_protobuf_Payload_Metric_long_value_tag:
      snprintf(out, n, "%llu", (unsigned long long)m.value.long_value);
      break;
    case org_eclipse_tahu_protobuf_Payload_Metric_boolean_value_tag:
      snprintf(out, n, "%s", m.value.boolean_value ? "true" : "false");
      break;
    default:
      snprintf(out, n, "(tip %u)", (unsigned)m.which_value);
  }
}

// Iki metrigin degeri ayni mi? (bu denemede kullanilan tipler)
static bool degerAyni(const Metric &a, const Metric &b) {
  if (a.which_value != b.which_value) return false;
  switch (a.which_value) {
    case org_eclipse_tahu_protobuf_Payload_Metric_int_value_tag:
      return a.value.int_value == b.value.int_value;
    case org_eclipse_tahu_protobuf_Payload_Metric_long_value_tag:
      return a.value.long_value == b.value.long_value;
    case org_eclipse_tahu_protobuf_Payload_Metric_boolean_value_tag:
      return a.value.boolean_value == b.value.boolean_value;
    default:
      return false;  // denemede baska tip yok; gelirse hata say
  }
}

static void dogrula(const org_eclipse_tahu_protobuf_Payload &orj,
                    const org_eclipse_tahu_protobuf_Payload &coz) {
  hataSayisi = 0;

  if (orj.timestamp != coz.timestamp) hata("timestamp", -1, orj.timestamp, coz.timestamp);
  if (orj.seq != coz.seq) hata("seq", -1, orj.seq, coz.seq);
  if (orj.metrics_count != coz.metrics_count) {
    hata("metrik sayisi", -1, orj.metrics_count, coz.metrics_count);
    Serial.printf("[Dogrulama] HATA: %d alan farkli\n", hataSayisi);
    return;  // sayilar farkliysa tek tek karsilastirmanin anlami yok
  }

  Serial.printf("[Dogrulama] cozulen payload: timestamp=%llu seq=%llu, %u metrik\n",
                (unsigned long long)coz.timestamp, (unsigned long long)coz.seq,
                (unsigned)coz.metrics_count);

  for (int i = 0; i < (int)coz.metrics_count; i++) {
    const Metric &a = orj.metrics[i];
    const Metric &b = coz.metrics[i];

    char deger[24];
    degerYaz(b, deger, sizeof(deger));
    Serial.printf("[Dogrulama] metric[%d] name=%s alias=%llu datatype=%u deger=%s\n",
                  i, b.name ? b.name : "(yok)", (unsigned long long)b.alias,
                  (unsigned)b.datatype, deger);

    const char *na = a.name ? a.name : "";
    const char *nb = b.name ? b.name : "";
    if (strcmp(na, nb) != 0) {
      hataSayisi++;
      Serial.printf("[Dogrulama] HATA: metric[%d].name farkli (beklenen %s, gelen %s)\n",
                    i, na, nb);
    }
    if (a.has_alias != b.has_alias || a.alias != b.alias) hata("alias", i, a.alias, b.alias);
    if (a.timestamp != b.timestamp) hata("timestamp", i, a.timestamp, b.timestamp);
    if (a.datatype != b.datatype) hata("datatype", i, a.datatype, b.datatype);
    if (!degerAyni(a, b)) {
      char beklenen[24];
      degerYaz(a, beklenen, sizeof(beklenen));
      hataSayisi++;
      Serial.printf("[Dogrulama] HATA: metric[%d].deger farkli (beklenen %s, gelen %s)\n",
                    i, beklenen, deger);
    }
  }

  if (hataSayisi == 0) {
    Serial.println("[Dogrulama] OK");
  } else {
    Serial.printf("[Dogrulama] HATA: %d alan farkli\n", hataSayisi);
  }
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

    // Kodlanmis mesaji geri coz ve her alani orijinaliyle karsilastir.
    // (decode_payload, Tahu'nun print_payload ciktisini da basar; o ciktidaki
    // alias/timestamp ESP32'de yanlis gorunur, asil sonuc asagidaki satirlar.)
    org_eclipse_tahu_protobuf_Payload decoded;
    memset(&decoded, 0, sizeof(decoded));
    if (decode_payload(&decoded, buf, (size_t)len) >= 0) {
      dogrula(payload, decoded);
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
