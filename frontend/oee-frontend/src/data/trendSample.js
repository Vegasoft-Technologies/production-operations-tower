// Trend grafikleri için örnek sabit veri (gerçek veri sonraki haftalarda backend'den).
// 5 dakikalık aralıklar, 2 saat. 10:30 ve 10:35 aralıklarında veri yok (null).

const START = Date.parse('2026-10-20T09:00:00+03:00');
const STEP = 5 * 60 * 1000;

// Her satır: [availability, performance, quality]; null = veri yok
const RATES = [
  [0.8, 1.0, 0.95], [0.8, 0.99, 0.95], [0.78, 1.0, 0.96], [0.8, 1.0, 0.95],
  [0.82, 0.98, 0.95], [0.8, 1.0, 0.94], [0.72, 1.0, 0.95], [0.66, 0.97, 0.95],
  [0.7, 0.99, 0.93], [0.79, 1.0, 0.95], [0.8, 1.0, 0.95], [0.81, 1.0, 0.96],
  [0.8, 0.99, 0.95], [0.8, 1.0, 0.95], [0.77, 1.0, 0.94], [0.8, 1.0, 0.95],
  [0.8, 1.0, 0.95], [0.8, 0.98, 0.95], null, null,
  [0.74, 1.0, 0.95], [0.8, 1.0, 0.95], [0.8, 1.0, 0.96], [0.8, 1.0, 0.95],
];

export const TREND_SAMPLE = RATES.map((r, i) => {
  const ts = START + i * STEP;
  if (!r) return { ts, availability: null, performance: null, quality: null, oee: null, parts: null };
  const [availability, performance, quality] = r;
  return {
    ts,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    // 5 dk = 300 sn; ideal çevrim 1 sn → parça = 300 × A × P
    parts: Math.round(300 * availability * performance),
  };
});

export const TREND_STEP_MS = STEP;
