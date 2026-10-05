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
    Number.isFinite(msg.ts) &&
    typeof msg.status === 'boolean' &&
    Number.isInteger(msg.total_count) &&
    Number.isInteger(msg.reject_count);

  return ok ? msg : null;
}
