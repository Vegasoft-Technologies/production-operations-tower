"""OpenPLC uretim simulasyonu - Modbus TCP dogrulama betigi.

Okunan adresler:
  HR0    (%QW0)   COUNTER1        toplam uretim
  HR1    (%QW1)   REJECT_COUNTER  hatali uretim
  Coil 0 (%QX0.0) STATUS_BIT      TRUE = makine calisiyor

Kontroller:
  1. Durum biti degisiyor; calisma ~8 sn, durus ~2 sn suruyor.
  2. Her tam calisma doneminde COUNTER1 8 +/- 1 artiyor.
  3. Durusta COUNTER1 ve REJECT_COUNTER hic artmiyor.
  4. Hatali artis <= toplam artis ve hatali ~ toplam / 20.
  5. (--pv ile) Sayac PV'yi gecmiyor ve PV'den sonra 0'a donuyor.

Cikis kodlari: 0 = tum kontroller gecti, 1 = baglanti hatasi, 2 = kontrol hatasi.

Kullanim:
  python modbus_oku.py                 # 30 sn test
  python modbus_oku.py --sure 600      # 10 dakikalik test
  python modbus_oku.py --pv 10         # tasma testi (PLC'de PV=10 iken)
"""
import argparse
import sys
import time

from pymodbus.client import ModbusTcpClient

CALISMA_SN = 8.0
DURUS_SN = 2.0
SURE_TOLERANS_SN = 0.5
SAYIM_TOLERANS = 1
HATA_ORANI = 20  # her 20. parca hatali
MAKS_BOSLUK_SN = 0.3     # durum sinirinda izin verilen okuma boslugu
MAKS_IC_BOSLUK_SN = 1.5  # bundan uzun bosluk bir durusu gizleyebilir


def oku(client):
    """Tutarli bir ornek dondurur: (zaman, durum, toplam, hatali) ya da None."""
    durum1 = client.read_coils(0, count=1)
    regs = client.read_holding_registers(0, count=2)
    durum2 = client.read_coils(0, count=1)
    if durum1.isError() or regs.isError() or durum2.isError():
        raise ConnectionError(f"Okuma hatasi: {durum1} {regs} {durum2}")
    # Okuma sirasinda durum degistiyse ornegi at; sayac hangi duruma ait belli degil.
    if durum1.bits[0] != durum2.bits[0]:
        return None
    return time.monotonic(), durum1.bits[0], regs.registers[0], regs.registers[1]


def artis(once, sonra, pv):
    """Sayac artisi; PV'den sonra 0'a donmeyi hesaba katar."""
    return (sonra - once) % (pv + 1)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=502)
    p.add_argument("--sure", type=float, default=30.0, help="test suresi (sn)")
    p.add_argument("--pv", type=int, default=32767, help="sayaclarin PV degeri")
    args = p.parse_args()

    client = ModbusTcpClient(args.host, port=args.port)
    if not client.connect():
        print(f"HATA: {args.host}:{args.port} adresine baglanilamadi. "
              "Runtime calisiyor mu, Modbus Server acik mi?")
        sys.exit(1)

    print(f"{args.host}:{args.port} dinleniyor, {args.sure:.0f} sn ...")
    ornekler = []
    bitis = time.monotonic() + args.sure
    son_yazilan = None
    try:
        while time.monotonic() < bitis:
            o = oku(client)
            if o:
                ornekler.append(o)
                # Ekrana saniyede bir satir yaz
                if son_yazilan is None or o[0] - son_yazilan >= 1.0:
                    son_yazilan = o[0]
                    print(time.strftime("%H:%M:%S"),
                          f"COUNTER1 = {o[2]:5d}  REJECT_COUNTER = {o[3]:5d}"
                          f"  STATUS_BIT = {o[1]}")
            time.sleep(0.05)
    except ConnectionError as e:
        print(f"HATA: {e}")
        sys.exit(1)
    finally:
        client.close()

    hatalar = []

    # Ornekleri durum bloklarina ayir: [durum, ilk_ornek, son_ornek]
    bloklar = []
    for o in ornekler:
        if bloklar and bloklar[-1][0] == o[1]:
            bloklar[-1][2] = o
        else:
            bloklar.append([o[1], o, o])

    # Bastaki ve sondaki bloklar yarim; sure ve sayim icin sadece
    # iki yani kapali bloklar kullanilir.

    print("\n--- Kontroller ---")

    # Ornekleme boslugu: okuma bir sure takildiysa o donemin olcumu guvenilmez.
    # Sinirdaki bosluk sureyi, icerideki uzun bosluk (gozden kacmis bir durus)
    # sayimi bozar. Bu donemler kontrol disi birakilir, sayi raporlanir.
    def bosluk(a, b):
        return b[0] - a[0]

    idx = {id(o): i for i, o in enumerate(ornekler)}

    def sinir_boslugu(blok_ilk):
        i = idx[id(blok_ilk)]
        return bosluk(ornekler[i - 1], blok_ilk) if i > 0 else 0.0

    def ic_bosluk(blok):
        i, j = idx[id(blok[1])], idx[id(blok[2])]
        return max((bosluk(ornekler[k], ornekler[k + 1]) for k in range(i, j)),
                   default=0.0)

    atlanan = 0
    gecerli_calisma = gecerli_durus = 0

    # 1. Durum sureleri (sadece iki yani kapali bloklar)
    for i in range(1, len(bloklar) - 1):
        b = bloklar[i]
        sonraki_ilk = bloklar[i + 1][1]
        belirsizlik = sinir_boslugu(b[1]) + sinir_boslugu(sonraki_ilk)
        ad = "Calisma" if b[0] else "Durus"
        if belirsizlik > MAKS_BOSLUK_SN or ic_bosluk(b) > MAKS_IC_BOSLUK_SN:
            atlanan += 1
            print(f"[ATLANDI] {ad} donemi: okuma bosluklu, olcum guvenilmez")
            continue
        sure = sonraki_ilk[0] - b[1][0]
        beklenen = CALISMA_SN if b[0] else DURUS_SN
        ok = abs(sure - beklenen) <= SURE_TOLERANS_SN
        print(f"[{'OK' if ok else 'HATA'}] {ad} suresi {sure:.2f} sn "
              f"(beklenen {beklenen:.0f} +/- {SURE_TOLERANS_SN} sn)")
        if b[0]:
            gecerli_calisma += 1
        else:
            gecerli_durus += 1
        if not ok:
            hatalar.append(f"{ad} suresi {sure:.2f} sn")

    # 2. ve 3. Calismada 8 +/- 1 artis, durusta artis yok
    for i, b in enumerate(bloklar):
        if b[0]:
            # Tam calisma: onceki durusun son ornegi -> sonraki durusun ilk ornegi
            if 0 < i < len(bloklar) - 1:
                if ic_bosluk(b) > MAKS_IC_BOSLUK_SN:
                    print("[ATLANDI] Calisma donemi sayimi: okuma bosluklu")
                    continue
                once = bloklar[i - 1][2]
                sonra = bloklar[i + 1][1]
                d = artis(once[2], sonra[2], args.pv)
                ok = abs(d - CALISMA_SN) <= SAYIM_TOLERANS
                print(f"[{'OK' if ok else 'HATA'}] Calisma doneminde COUNTER1 +{d} "
                      f"(beklenen {CALISMA_SN:.0f} +/- {SAYIM_TOLERANS})")
                if not ok:
                    hatalar.append(f"Calisma doneminde COUNTER1 +{d}")
        else:
            # Durus: blok icindeki ilk ve son ornek arasinda sayac sabit kalmali
            d_top = artis(b[1][2], b[2][2], args.pv)
            d_hata = artis(b[1][3], b[2][3], args.pv)
            ok = d_top == 0 and d_hata == 0
            print(f"[{'OK' if ok else 'HATA'}] Durusta COUNTER1 +{d_top}, "
                  f"REJECT_COUNTER +{d_hata} (beklenen 0)")
            if not ok:
                hatalar.append(f"Durusta sayac artti (+{d_top} / +{d_hata})")

    if gecerli_calisma == 0 or gecerli_durus == 0:
        hatalar.append("Olculebilen tam bir calisma ve durus donemi yok "
                       "(durum degismiyor ya da test suresi kisa).")
    if atlanan:
        print(f"Not: {atlanan} donem okuma boslugu nedeniyle sure kontrolune alinmadi.")

    # 4. Hatali <= toplam ve oran ~ 1/20
    toplam = sum(artis(a[2], b[2], args.pv) for a, b in zip(ornekler, ornekler[1:]))
    hatali = sum(artis(a[3], b[3], args.pv) for a, b in zip(ornekler, ornekler[1:]))
    ok = hatali <= toplam
    print(f"[{'OK' if ok else 'HATA'}] Hatali artis ({hatali}) <= toplam artis ({toplam})")
    if not ok:
        hatalar.append("Hatali artis toplamdan buyuk")
    beklenen_hatali = toplam / HATA_ORANI
    ok = abs(hatali - beklenen_hatali) <= 1
    print(f"[{'OK' if ok else 'HATA'}] Hatali orani: {hatali} / {toplam} "
          f"(beklenen ~{beklenen_hatali:.1f}, her {HATA_ORANI}. parca)")
    if not ok:
        hatalar.append(f"Hatali orani beklenenden farkli ({hatali}/{toplam})")

    # 5. Tasma: sayac PV'yi gecmemeli, PV'den sonra 0'a donmeli
    en_buyuk = max(o[2] for o in ornekler)
    ok = en_buyuk <= args.pv
    print(f"[{'OK' if ok else 'HATA'}] COUNTER1 en fazla {en_buyuk} (PV = {args.pv})")
    if not ok:
        hatalar.append(f"COUNTER1 PV'yi gecti ({en_buyuk})")
    if args.pv < 32767:
        donus = any(b[2] < a[2] for a, b in zip(ornekler, ornekler[1:]))
        print(f"[{'OK' if donus else 'HATA'}] COUNTER1 PV'den sonra 0'a dondu")
        if not donus:
            hatalar.append("Tasma testinde sayac basa donmedi")

    print(f"\nOzet: {args.sure:.0f} sn'de COUNTER1 +{toplam}, REJECT_COUNTER +{hatali}")
    if hatalar:
        print(f"SONUC: BASARISIZ ({len(hatalar)} hata)")
        for h in hatalar:
            print("  -", h)
        sys.exit(2)
    print("SONUC: TUM KONTROLLER GECTI")
    sys.exit(0)


if __name__ == "__main__":
    main()
