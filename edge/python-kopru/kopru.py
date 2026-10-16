"""Yedek Python koprusu: OpenPLC -> MQTT

ESP32 (Wokwi) calismadiginda onun yerine gecer. OpenPLC'yi Modbus TCP ile
okur ve ESP32 ile ayni JSON'u ayni topic'e her saniye yayinlar.

Okunan adresler:
  HR0    (%QW0)   total_count
  HR1    (%QW1)   reject_count
  Coil 0 (%QX0.0) status

Kurallar:
  - ts bilgisayarin saatinden alinir (Unix zamani, milisaniye).
  - Modbus okumasi basarisiz olursa o saniye mesaj gonderilmez.
  - Yerel Mosquitto'ya yazar; mesajlar mevcut kopru uzerinden ekip
    broker'ina gider. Bu yuzden kodda sifre yoktur.
  - Ayni topic'e iki kaynak yazmasin diye acilista birkac saniye topic'i
    dinler; mesaj geliyorsa (ESP32 calisiyorsa) baslamayi reddeder.
    Calisirken baska bir kaynaktan mesaj gelirse de durur.

Cikis kodlari: 0 = Ctrl+C ile durduruldu, 1 = baglanti hatasi,
               2 = topic'e baska bir kaynak yaziyor.

Kullanim:
  python kopru.py
  python kopru.py --dinle 5
"""
import argparse
import collections
import json
import logging
import signal
import sys
import threading
import time

import paho.mqtt.client as mqtt
from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

FACTORY = "Factory_1"
LINE = "Production_Line_1"
MACHINE = "Machine_1"
TOPIC = f"{FACTORY}/{LINE}/{MACHINE}/data"
CLIENT_ID = "python-kopru-machine-1"  # ESP32'ninki: esp32-machine-1
PERIYOT_SN = 1.0


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


# ---------------------------------------------------------------------------
# Modbus
# ---------------------------------------------------------------------------
def plc_oku(client):
    """(status, total, reject) dondurur; okuma basarisizsa None."""
    try:
        if not client.connected and not client.connect():
            return None
        regs = client.read_holding_registers(0, count=2)
        coil = client.read_coils(0, count=1)
    except (ModbusException, OSError) as e:
        log(f"[Modbus] hata: {e}")
        client.close()
        return None
    if regs.isError() or coil.isError():
        log(f"[Modbus] hata: {regs} {coil}")
        return None
    return bool(coil.bits[0]), regs.registers[0], regs.registers[1]


def json_olustur(ts_ms, status, total, reject):
    # Alan sirasi ve bicim ESP32 ile ayni (bosluksuz JSON).
    return json.dumps(
        {
            "factory": FACTORY,
            "line": LINE,
            "machine": MACHINE,
            "ts": ts_ms,
            "status": status,
            "total_count": total,
            "reject_count": reject,
        },
        separators=(",", ":"),
    )


# ---------------------------------------------------------------------------
# MQTT
# ---------------------------------------------------------------------------
class Kopru:
    def __init__(self, host, port):
        self.gonderilen = collections.deque(maxlen=20)  # kendi mesajlarimiz
        self.kilit = threading.Lock()
        self.yabanci = threading.Event()  # baska kaynaktan mesaj geldi
        self.bagli = threading.Event()
        self.kapaniyor = False

        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.reconnect_delay_set(min_delay=1, max_delay=5)
        self.client.connect_async(host, port, keepalive=15)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            log(f"[MQTT] baglanti reddedildi: {reason_code}")
            return
        log("[MQTT] OK")
        client.subscribe(TOPIC)  # yeniden baglaninca da abone ol
        self.bagli.set()

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.bagli.clear()
        if not self.kapaniyor:
            log(f"[MQTT] baglanti koptu ({reason_code}), yeniden denenecek")

    def _on_message(self, client, userdata, msg):
        if msg.retain:
            return  # eski, saklanmis mesaj; su an yazan biri oldugunu gostermez
        payload = msg.payload.decode(errors="replace")
        with self.kilit:
            if payload in self.gonderilen:
                return  # kendi mesajimiz geri geldi
        self.yabanci.set()

    def yayinla(self, payload):
        with self.kilit:
            self.gonderilen.append(payload)
        info = self.client.publish(TOPIC, payload, qos=0)
        return info.rc == mqtt.MQTT_ERR_SUCCESS

    def kapat(self):
        self.kapaniyor = True
        self.client.disconnect()
        self.client.loop_stop()


# ---------------------------------------------------------------------------
def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--plc-host", default="127.0.0.1")
    p.add_argument("--plc-port", type=int, default=502)
    p.add_argument("--mqtt-host", default="127.0.0.1")
    p.add_argument("--mqtt-port", type=int, default=1883)
    p.add_argument("--dinle", type=float, default=3.0,
                   help="acilista topic'i dinleme suresi (sn)")
    args = p.parse_args()

    # pymodbus her basarisiz denemede uzun hata basiyor; bizim satirimiz yeterli.
    logging.getLogger("pymodbus").setLevel(logging.CRITICAL)

    kopru = Kopru(args.mqtt_host, args.mqtt_port)
    if not kopru.bagli.wait(timeout=5):
        log(f"[MQTT] HATA: {args.mqtt_host}:{args.mqtt_port} adresine "
            "baglanilamadi. Mosquitto calisiyor mu?")
        kopru.kapat()
        sys.exit(1)

    # 1) Baska bir kaynak (ESP32) yayin yapiyor mu?
    log(f"[Kontrol] {args.dinle:.0f} sn boyunca {TOPIC} dinleniyor...")
    if kopru.yabanci.wait(timeout=args.dinle):
        log("[Kontrol] HATA: Bu topic'e su an baska bir kaynak yaziyor "
            "(ESP32 acik olabilir). Once onu kapat, sonra kopruyu baslat.")
        kopru.kapat()
        sys.exit(2)
    log("[Kontrol] OK, topic bos. Yayin basliyor.")

    plc = ModbusTcpClient(args.plc_host, port=args.plc_port, timeout=0.5)
    durdur = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: durdur.set())

    sonraki = time.monotonic()
    cikis = 0
    while not durdur.is_set():
        # Calisirken ESP32 acilirsa ikimiz ayni topic'e yazmayalim.
        if kopru.yabanci.is_set():
            log("[Kontrol] HATA: Topic'e baska bir kaynak yazmaya basladi. "
                "Kopru duruyor.")
            cikis = 2
            break

        okuma = plc_oku(plc)
        if okuma is None:
            log("[Modbus] okuma basarisiz, bu saniye mesaj gonderilmedi")
        else:
            status, total, reject = okuma
            payload = json_olustur(time.time_ns() // 1_000_000,
                                   status, total, reject)
            if kopru.bagli.is_set() and kopru.yayinla(payload):
                log("[PUB]", payload)
            else:
                log("[PUB HATA] MQTT bagli degil:", payload)

        # Saniyede bir; geride kalinirsa yetismeye calismadan devam et.
        sonraki += PERIYOT_SN
        bekle = sonraki - time.monotonic()
        if bekle < 0:
            sonraki = time.monotonic()
            bekle = 0
        durdur.wait(bekle)

    plc.close()
    kopru.kapat()
    log("Kopru durdu.")
    sys.exit(cikis)


if __name__ == "__main__":
    main()
