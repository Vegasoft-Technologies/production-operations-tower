// Veri sözleşmesindeki sayaç kuralları (docs/veri-sozlesmesi.md).
// Neşe'nin backend/app/oee.py dosyasıyla aynı sonucu vermeli.

// Sayaç 32767'den sonra 0'a döner ve bu geçiş parça sayılmaz → mod 32767.
export const COUNTER_MOD = 32767;
// Makine saniyede en fazla 1 parça yapar; 4 okuma zamanlaması için pay.
export const READ_MARGIN = 4;
// İki mesaj arası bundan uzunsa adım veri kesintisidir (OEE'ye ve "son 60 sn"ye girmez).
export const OUTAGE_MS = 10_000;
// İki mesaj arası bundan uzunsa üretim bilinmiyor sayılır (toplama da eklenmez).
export const UNKNOWN_MS = 60 * 60 * 1000;

// Ham artış: taşmayı hesaba katar, sıfırlanmayı ayırt etmez.
export function rawIncrement(oldValue, newValue) {
  return (((newValue - oldValue) % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD;
}

// İki mesaj arasında geçen süre: saniye, yukarı yuvarlanır, en az 1.
export function elapsedSeconds(oldTs, newTs) {
  return Math.max(1, Math.ceil((newTs - oldTs) / 1000));
}

// Bir sayacın iki mesaj arasındaki adımı.
// inc: eklenecek parça sayısı; null = bilinmiyor (1 saatten uzun kesinti)
// outage: true ise bu adım veri kesintisidir (OEE ve "son 60 sn" dışında tutulur)
export function counterStep(oldValue, newValue, oldTs, newTs) {
  const gapMs = newTs - oldTs;
  const outage = gapMs > OUTAGE_MS;
  if (gapMs > UNKNOWN_MS) return { inc: null, outage: true };

  const raw = rawIncrement(oldValue, newValue);
  const limit = elapsedSeconds(oldTs, newTs) + READ_MARGIN;
  // Sınırı aşan artış = sayaç sıfırlanmış (PLC yeniden başladı) → 0
  return { inc: raw > limit ? 0 : raw, outage };
}

// Son `windowMs` içindeki artışların toplamı.
// entries: [{ ts, inc }] — yalnızca kesinti olmayan adımlar.
export function sumWindow(entries, nowTs, windowMs = 60_000) {
  return entries
    .filter((e) => e.ts > nowTs - windowMs)
    .reduce((sum, e) => sum + e.inc, 0);
}
