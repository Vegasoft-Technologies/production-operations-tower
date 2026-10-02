# Modbus TCP ile COUNTER1 (Holding Register 0) ve STATUS_BIT (Coil 0) okur
import time
from pymodbus.client import ModbusTcpClient

c = ModbusTcpClient("127.0.0.1", port=502)
if not c.connect():
    print("Baglanamadi! Runtime calisiyor mu, Modbus 502 acik mi?")
    raise SystemExit

for _ in range(12):
    hr = c.read_holding_registers(0, count=1)
    co = c.read_coils(0, count=1)
    if hr.isError() or co.isError():
        print("Okuma hatasi:", hr, co)
    else:
        print(time.strftime("%H:%M:%S"),
              "COUNTER1 =", hr.registers[0],
              " STATUS_BIT =", co.bits[0])
    time.sleep(1)

c.close()
