(* OpenPLC uretim simulasyonu - main.ld ile birebir ayni mantik.          *)
(* Her bolum Ladder'daki bir rung'a karsilik gelir (Rung 1 ... Rung 7).   *)
PROGRAM main
  (* Modbus'a acilan degiskenler. Not: v3 web panelinin Monitoring sayfasi
     yorum iceren satirlari okumadigi icin aciklamalar ayri satirdadir.
     COUNTER1       -> HR0    toplam uretim
     REJECT_COUNTER -> HR1    hatali uretim
     STATUS_BIT     -> Coil 0 TRUE = makine calisiyor *)
  VAR
    COUNTER1 AT %QW0 : INT := 0;
    REJECT_COUNTER AT %QW1 : INT := 0;
    STATUS_BIT AT %QX0.0 : BOOL := FALSE;
  END_VAR
  (* TICK: 1 sn darbe, CALISMA_BITTI: 8 sn doldu, URETIM_DARBE: 1 parca,
     C1_DOLU / HATA_DOLU: sayac doldu, PARCA_20: 20. parca (hatali) *)
  VAR
    TICK : BOOL;
    CALISMA_BITTI : BOOL;
    URETIM_DARBE : BOOL;
    C1_DOLU : BOOL;
    PARCA_20 : BOOL;
    HATA_DOLU : BOOL;
    T_1S : TON;
    T_DURUS : TON;
    T_CALISMA : TON;
    C1 : CTU;
    C_PARCA : CTU;
    C_HATA : CTU;
  END_VAR

  (* Rung 1 - Darbe uretici. Periyot = PT + 2 tarama (20 ms) = 1 sn *)
  T_1S(IN := NOT TICK, PT := T#960ms);
  TICK := T_1S.Q;

  (* Rung 2 - Durus suresi: makine 2 sn durur, sonra STATUS_BIT = TRUE *)
  T_DURUS(IN := NOT CALISMA_BITTI, PT := T#2s);
  STATUS_BIT := T_DURUS.Q;

  (* Rung 3 - Calisma suresi: 8 sn sonra CALISMA_BITTI ile T_DURUS sifirlanir *)
  T_CALISMA(IN := STATUS_BIT, PT := T#8s);
  CALISMA_BITTI := T_CALISMA.Q;

  (* Rung 4 - Uretim darbesi: sadece makine calisirken parca uretilir *)
  URETIM_DARBE := TICK AND STATUS_BIT;

  (* Rung 5 - Toplam uretim sayaci, 32767'den sonra 0'a doner *)
  C1(CU := URETIM_DARBE, R := C1_DOLU, PV := 32767);
  C1_DOLU := C1.Q;
  COUNTER1 := C1.CV;

  (* Rung 6 - Her 20. parca hatali sayilir (Quality = %95) *)
  C_PARCA(CU := URETIM_DARBE, R := PARCA_20, PV := 20);
  PARCA_20 := C_PARCA.Q;

  (* Rung 7 - Hatali uretim sayaci, 32767'den sonra 0'a doner *)
  C_HATA(CU := PARCA_20, R := HATA_DOLU, PV := 32767);
  HATA_DOLU := C_HATA.Q;
  REJECT_COUNTER := C_HATA.CV;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms,PRIORITY := 0);
    PROGRAM instance0 WITH task0 : main;
  END_RESOURCE
END_CONFIGURATION
