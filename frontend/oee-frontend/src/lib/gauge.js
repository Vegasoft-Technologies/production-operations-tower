// OEE göstergeleri için renk ve yüzde biçimi.
// Eşikler: %70 altı kırmızı, %70–85 sarı, %85 ve üstü yeşil.

export const GAUGE_COLORS = {
  red: '#dc2626',
  yellow: '#eab308',
  green: '#16a34a',
};

export const YELLOW_FROM = 70; // yüzde
export const GREEN_FROM = 85; // yüzde

// 0–1 arası değeri 0–100 arası yüzdeye çevirir, tek ondalığa yuvarlar.
// Renk de bu yuvarlanmış değere göre seçilir: ekranda %70,0 yazıyorsa sarıdır.
export function toPercent(value) {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 1000) / 10;
}

export function gaugeColor(value) {
  const pct = toPercent(value);
  if (pct >= GREEN_FROM) return GAUGE_COLORS.green;
  if (pct >= YELLOW_FROM) return GAUGE_COLORS.yellow;
  return GAUGE_COLORS.red;
}

// Ekran metni: "%76,0"
export function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `%${toPercent(value).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}
