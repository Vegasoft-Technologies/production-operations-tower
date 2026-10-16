// Bu hafta OEE değerleri örnek. Gerçek değerler Hafta 4'te backend'den gelecek.
export const SAMPLE_OEE = { availability: 0.8, performance: 1.0, quality: 0.95 };

// Ekran görüntüsü için adres çubuğundan değer verilebilir:
//   http://localhost:5173/?a=0.65&p=0.76&q=0.95
// Geçersiz ya da eksik değerlerde örnek değer kullanılır.
export function readSampleOee(search = '') {
  const params = new URLSearchParams(search);
  const pick = (key, fallback) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return fallback;
    const v = Number(raw.replace(',', '.'));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  };
  return {
    availability: pick('a', SAMPLE_OEE.availability),
    performance: pick('p', SAMPLE_OEE.performance),
    quality: pick('q', SAMPLE_OEE.quality),
  };
}
