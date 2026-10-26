import { isMillisecondTimestamp } from './telemetry.js';
import { formatDuration } from './format.js';

// Backend'in "event: oee" mesajını sözleşmeye göre denetler.
// Uymayan mesajda ekran o mesajı yok sayar, çökmez; ilk uymayan alan ekranda not olarak görünür.
//
// {"factory","line","machine","ts","session_start","session_end",
//  "availability","performance","quality","oee","total","reject",
//  "no_data_seconds","gap_parts"}

const isRatio = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isRatioOrNull = (v) => v === null || isRatio(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isName = (v) => typeof v === 'string' && v.length > 0;

// Kurallar sırayla denenir; ilk uymayanın açıklaması döner.
const RULES = [
  ['factory', (m) => isName(m.factory), 'boş olmayan metin olmalı'],
  ['line', (m) => isName(m.line), 'boş olmayan metin olmalı'],
  ['machine', (m) => isName(m.machine), 'boş olmayan metin olmalı'],
  ['ts', (m) => isMillisecondTimestamp(m.ts), 'milisaniye cinsinden zaman olmalı'],
  ['session_start', (m) => isMillisecondTimestamp(m.session_start), 'milisaniye cinsinden zaman olmalı'],
  [
    'session_end',
    (m) => m.session_end === null || (isMillisecondTimestamp(m.session_end) && m.session_end >= m.session_start),
    'null ya da session_start\'tan sonraki ms zaman olmalı',
  ],
  ['availability', (m) => isRatio(m.availability), '0–1 arasında sayı olmalı'],
  ['performance', (m) => isRatioOrNull(m.performance), '0–1 arasında sayı ya da null olmalı'],
  ['quality', (m) => isRatioOrNull(m.quality), '0–1 arasında sayı ya da null olmalı'],
  ['oee', (m) => isRatio(m.oee), '0–1 arasında sayı olmalı'],
  ['total', (m) => isCount(m.total), 'negatif olmayan tam sayı olmalı'],
  ['reject', (m) => isCount(m.reject), 'negatif olmayan tam sayı olmalı'],
  [
    'no_data_seconds',
    (m) => typeof m.no_data_seconds === 'number' && Number.isFinite(m.no_data_seconds) && m.no_data_seconds >= 0,
    'negatif olmayan sayı olmalı',
  ],
  ['gap_parts', (m) => isCount(m.gap_parts), 'negatif olmayan tam sayı olmalı'],
];

// { msg, error }: geçerliyse msg dolu, değilse error ilk sorunu anlatır.
export function checkOee(raw) {
  let msg;
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { msg: null, error: 'JSON okunamadı' };
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return { msg: null, error: 'mesaj bir JSON nesnesi değil' };
  }
  for (const [field, ok, rule] of RULES) {
    if (!(field in msg)) return { msg: null, error: `${field} alanı eksik` };
    if (!ok(msg)) return { msg: null, error: `${field} ${rule}` };
  }
  return { msg, error: null };
}

export function parseOee(raw) {
  return checkOee(raw).msg;
}

// Kesinti notu yalnızca anlamlı bir kesinti varsa gösterilir:
// en az 1 sn veri yok ya da kesintide üretilip OEE dışında kalan parça var.
export function hasGapNote(oee) {
  return Boolean(oee) && (oee.no_data_seconds >= 1 || oee.gap_parts > 0);
}

// Kesinti notunun metni; not gerekmiyorsa null.
// Parça 0 ise "kesintide üretilen 0 parça" kısmı yazılmaz (kesinti sürerken hep 0'dır).
export function gapNoteText(oee) {
  if (!hasGapNote(oee)) return null;
  const parts = [];
  if (oee.no_data_seconds >= 1) parts.push(`${formatDuration(oee.no_data_seconds)} veri yok`);
  if (oee.gap_parts > 0) {
    parts.push(`kesintide üretilen ${oee.gap_parts.toLocaleString('tr-TR')} parça OEE dışında`);
  }
  return `Veri kesintisi: ${parts.join(' · ')}`;
}
