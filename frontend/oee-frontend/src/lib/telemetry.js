// ts'nin milisaniye cinsinden Unix zamanı olduğunu doğrular.
// Saniye cinsinden bir değer (ör. 1760180400) bu aralığın çok altında kalır.
export const TS_MIN_MS = Date.UTC(2020, 0, 1); // 1577836800000
export const TS_MAX_MS = Date.UTC(2100, 0, 1); // 4102444800000

export function isMillisecondTimestamp(ts) {
  return Number.isInteger(ts) && ts >= TS_MIN_MS && ts < TS_MAX_MS;
}

// Gelen mesajı sözleşmeye göre doğrular. Geçersizse null döner (ekran çökmez).
export function parseTelemetry(raw) {
  let msg;
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  // Backend mesajı { topic, payload } içine sararsa onu da kabul et
  if (msg && typeof msg === 'object' && msg.payload && typeof msg.payload === 'object') {
    msg = msg.payload;
  }
  if (!msg || typeof msg !== 'object') return null;

  const ok =
    typeof msg.factory === 'string' &&
    typeof msg.line === 'string' &&
    typeof msg.machine === 'string' &&
    isMillisecondTimestamp(msg.ts) &&
    typeof msg.status === 'boolean' &&
    Number.isInteger(msg.total_count) &&
    Number.isInteger(msg.reject_count);

  return ok ? msg : null;
}
