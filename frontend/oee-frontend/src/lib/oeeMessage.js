import { isMillisecondTimestamp } from './telemetry.js';

// Backend'in "event: oee" mesajını sözleşmeye göre denetler.
// Uymayan mesajda null döner; ekran o mesajı yok sayar, çökmez.
//
// {"factory","line","machine","ts","session_start","session_end",
//  "availability","performance","quality","oee","total","reject",
//  "no_data_seconds","gap_parts"}

const isRatio = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isRatioOrNull = (v) => v === null || isRatio(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isName = (v) => typeof v === 'string' && v.length > 0;

export function parseOee(raw) {
  let msg;
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;

  const ok =
    isName(msg.factory) &&
    isName(msg.line) &&
    isName(msg.machine) &&
    isMillisecondTimestamp(msg.ts) &&
    isMillisecondTimestamp(msg.session_start) &&
    (msg.session_end === null ||
      (isMillisecondTimestamp(msg.session_end) && msg.session_end >= msg.session_start)) &&
    isRatio(msg.availability) &&
    isRatioOrNull(msg.performance) &&
    isRatioOrNull(msg.quality) &&
    isRatio(msg.oee) &&
    isCount(msg.total) &&
    isCount(msg.reject) &&
    typeof msg.no_data_seconds === 'number' &&
    Number.isFinite(msg.no_data_seconds) &&
    msg.no_data_seconds >= 0 &&
    isCount(msg.gap_parts);

  return ok ? msg : null;
}
