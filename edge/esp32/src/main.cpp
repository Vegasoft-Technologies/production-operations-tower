// Hafta 2 - OpenPLC -> ESP32 -> MQTT koprusu
//
// Her saniye:
//   1) OpenPLC'den Modbus TCP ile HR0 (total_count), HR1 (reject_count)
//      ve Coil 0 (status) okunur.
//   2) Veri sozlesmesindeki JSON olusturulur (ts: NTP'den, milisaniye).
//   3) Factory_1/Production_Line_1/Machine_1/data topic'ine yayinlanir.
// Modbus okumasi basarisiz olursa o saniye mesaj GONDERILMEZ.
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_sntp.h>
#include <sys/time.h>
#include <time.h>
#include "secrets.h"
 
// ---- Sabitler ----
const char *WIFI_SSID = "Wokwi-GUEST";        // Wokwi sanal agi (sifresiz)
const char *MODBUS_HOST = "host.wokwi.internal"; // bilgisayarin localhost'u
const uint16_t MODBUS_PORT = 502;
const uint8_t MODBUS_UNIT = 1;
const uint32_t MODBUS_TIMEOUT_MS = 500;
 
const char *FACTORY = "Factory_1";
const char *LINE = "Production_Line_1";
const char *MACHINE = "Machine_1";
const char *TOPIC = "Factory_1/Production_Line_1/Machine_1/data";
const char *MQTT_CLIENT_ID = "esp32-machine-1";
 
const uint32_t PERIOD_MS = 1000;
 
WiFiClient modbusNet;
WiFiClient mqttNet;
PubSubClient mqtt(mqttNet);
uint16_t transactionId = 0;
 
// ---------------------------------------------------------------------------
// Wi-Fi ve NTP
// ---------------------------------------------------------------------------
void connectWiFi() {
  Serial.print("[WiFi] baglaniliyor");
  WiFi.begin(WIFI_SSID, "", 6);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] OK, IP: %s\n", WiFi.localIP().toString().c_str());
}
 
void syncTime() {
     // Wokwi simulasyonu gercek zamandan yavas calisabiliyor ve sekme arka
     // plandayken duraklayabiliyor; ESP32 saati bu yuzden geride kaliyor.
     // NTP'yi 15 sn'de bir yenileyerek ts'yi gercek saate yakin tutuyoruz.
    sntp_set_sync_interval(15000);
  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC
  Serial.print("[NTP] saat aliniyor");
  time_t now = 0;
  for (int i = 0; i < 40 && now < 1700000000; i++) {  // 2023'ten once = senkron degil
    delay(250);
    Serial.print(".");
    time(&now);
  }
  Serial.println(now >= 1700000000 ? "\n[NTP] OK" : "\n[NTP] HATA, saat alinamadi");
}
 
// Unix zamani, milisaniye. Saat senkron degilse 0 doner.
uint64_t nowMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000ULL;
}
 
// ---------------------------------------------------------------------------
// Modbus TCP istemcisi (kucuk, kutuphanesiz)
// Istek:  MBAP [islem no(2) | protokol=0(2) | uzunluk=6(2) | unit(1)]
//         PDU  [fonksiyon(1) | baslangic adresi(2) | adet(2)]
// ---------------------------------------------------------------------------
bool modbusConnect() {
  if (modbusNet.connected()) return true;
  modbusNet.stop();
  return modbusNet.connect(MODBUS_HOST, MODBUS_PORT, MODBUS_TIMEOUT_MS);
}
 
// Tam olarak n byte okur; zaman asiminda false doner.
bool readExact(uint8_t *buf, size_t n) {
  uint32_t start = millis();
  size_t got = 0;
  while (got < n) {
    if (millis() - start > MODBUS_TIMEOUT_MS) return false;
    int c = modbusNet.read();
    if (c < 0) {
      delay(1);
      continue;
    }
    buf[got++] = (uint8_t)c;
  }
  return true;
}
 
// Fonksiyon 0x03 (Holding Register) ya da 0x01 (Coil) istegi gonderir.
// Cevabin veri kismini 'data'ya koyar, byte sayisini 'dataLen'e yazar.
bool modbusRequest(uint8_t function, uint16_t address, uint16_t count,
                   uint8_t *data, uint8_t &dataLen) {
  if (!modbusConnect()) return false;
 
  uint16_t tid = ++transactionId;
  uint8_t req[12] = {
      (uint8_t)(tid >> 8), (uint8_t)tid,  // islem no
      0, 0,                               // protokol = Modbus
      0, 6,                               // kalan byte sayisi
      MODBUS_UNIT,
      function,
      (uint8_t)(address >> 8), (uint8_t)address,
      (uint8_t)(count >> 8), (uint8_t)count};
 
  while (modbusNet.available()) modbusNet.read();  // eski artiklari temizle
  if (modbusNet.write(req, sizeof(req)) != sizeof(req)) return false;
 
  uint8_t head[9];  // MBAP(7) + fonksiyon(1) + byte sayisi(1)
  if (!readExact(head, 7 + 1)) return false;
  uint16_t rtid = (head[0] << 8) | head[1];
  if (rtid != tid) return false;
  if (head[7] == (function | 0x80)) {  // Modbus istisna cevabi
    uint8_t exc;
    readExact(&exc, 1);
    Serial.printf("[Modbus] istisna, fonksiyon 0x%02X kod %u\n", function, exc);
    return false;
  }
  if (head[7] != function) return false;
  if (!readExact(&head[8], 1)) return false;
  dataLen = head[8];
  if (dataLen > 32) return false;
  return readExact(data, dataLen);
}
 
struct Reading {
  bool status;
  int16_t total;
  int16_t reject;
};
 
// HR0, HR1 ve Coil 0'i okur. Herhangi biri basarisizsa false doner.
bool readPlc(Reading &r) {
  uint8_t data[32];
  uint8_t len = 0;
 
  if (!modbusRequest(0x03, 0, 2, data, len) || len != 4) {
    modbusNet.stop();  // bir sonraki denemede yeniden baglan
    return false;
  }
  r.total = (int16_t)((data[0] << 8) | data[1]);
  r.reject = (int16_t)((data[2] << 8) | data[3]);
 
  if (!modbusRequest(0x01, 0, 1, data, len) || len != 1) {
    modbusNet.stop();
    return false;
  }
  r.status = data[0] & 0x01;
  return true;
}
 
// ---------------------------------------------------------------------------
// MQTT
// ---------------------------------------------------------------------------
bool ensureMqtt() {
  if (mqtt.connected()) return true;
  Serial.printf("[MQTT] %s:%d baglaniliyor...\n", MQTT_HOST, MQTT_PORT);
  if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
    Serial.println("[MQTT] OK");
    return true;
  }
  Serial.printf("[MQTT] HATA, durum kodu: %d\n", mqtt.state());
  return false;
}
 
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);
  connectWiFi();
  syncTime();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  ensureMqtt();
}
 
uint32_t lastTick = 0;
 
void loop() {
  mqtt.loop();
 
  if (millis() - lastTick < PERIOD_MS) {
    delay(5);
    return;
  }
  lastTick += PERIOD_MS;
  if (millis() - lastTick > PERIOD_MS) lastTick = millis();  // geride kaldiysa yakala
 
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] baglanti koptu, yeniden baglaniliyor");
    connectWiFi();
    return;
  }
 
  Reading r;
  if (!readPlc(r)) {
    Serial.println("[Modbus] okuma basarisiz, bu saniye mesaj gonderilmedi");
    return;
  }
 
  uint64_t ts = nowMs();
  if (ts == 0) {
    Serial.println("[NTP] saat senkron degil, bu saniye mesaj gonderilmedi");
    return;
  }
 
  char json[220];
  snprintf(json, sizeof(json),
           "{\"factory\":\"%s\",\"line\":\"%s\",\"machine\":\"%s\","
           "\"ts\":%llu,\"status\":%s,\"total_count\":%d,\"reject_count\":%d}",
           FACTORY, LINE, MACHINE, (unsigned long long)ts,
           r.status ? "true" : "false", r.total, r.reject);
 
  if (!ensureMqtt()) return;
  bool ok = mqtt.publish(TOPIC, json);
  Serial.printf("%s %s\n", ok ? "[PUB]" : "[PUB HATA]", json);
}
