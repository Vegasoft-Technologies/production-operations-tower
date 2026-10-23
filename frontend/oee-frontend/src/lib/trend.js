// Trend grafikleri için yardımcılar (saf fonksiyonlar, testli).

// null değer dizilerinin çevresindeki aralıklar: grafikte "veri yok" bandı.
// Bant, kopukluktan önceki son noktadan sonraki ilk noktaya kadar uzanır.
export function findGaps(rows, key) {
  const gaps = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i][key] === null) {
      const startIdx = i;
      while (i < rows.length && rows[i][key] === null) i++;
      const from = startIdx > 0 ? rows[startIdx - 1].ts : rows[startIdx].ts;
      const to = i < rows.length ? rows[i].ts : rows[i - 1].ts;
      gaps.push([from, to]);
    } else {
      i++;
    }
  }
  return gaps;
}

// Oran (0–1) → grafikte yüzde (tek ondalık). null olduğu gibi kalır: çizgi kopar.
export const ratioToPct = (v) => (v === null ? null : Math.round(v * 1000) / 10);
