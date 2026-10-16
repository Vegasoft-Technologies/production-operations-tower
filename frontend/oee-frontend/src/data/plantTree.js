// ISA-95 hiyerarşisi: Fabrika > Hat > Makine.
// Şimdilik sabit. Hafta 7'de backend'deki aktif cihazlardan oluşturulacak.
// İsimler MQTT topic'teki adlarla birebir aynı olmalı (büyük/küçük harf dahil).
export const PLANT_TREE = [
  {
    id: 'Factory_1',
    level: 'Fabrika',
    children: [
      {
        id: 'Production_Line_1',
        level: 'Hat',
        children: [{ id: 'Machine_1', level: 'Makine', children: [] }],
      },
    ],
  },
];
