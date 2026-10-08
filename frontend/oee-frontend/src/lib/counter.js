// Veri sözleşmesindeki sayaç kuralları.
// Sayaç 32767'den sonra 0'a döner ve bu geçiş parça sayılmaz → mod 32767.
export const COUNTER_MOD = 32767;
// İki mesaj arasındaki artış bundan büyükse sayaç sıfırlanmış (PLC yeniden başladı) kabul edilir.
export const MAX_STEP = 5;

export function counterIncrement(oldValue, newValue) {
  const step = (((newValue - oldValue) % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD;
  return step > MAX_STEP ? 0 : step;
}

// Son `windowMs` içindeki artışların toplamı.
// entries: [{ ts, inc }] — ts ESP32'nin NTP zamanı (ms).
export function sumWindow(entries, nowTs, windowMs = 60_000) {
  return entries
    .filter((e) => e.ts > nowTs - windowMs)
    .reduce((sum, e) => sum + e.inc, 0);
}
