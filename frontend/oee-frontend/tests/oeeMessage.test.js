import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOee, checkOee, hasGapNote, gapNoteText } from '../src/lib/oeeMessage.js';

// Sözleşmedeki örnek mesajın aynısı
const good = {
  factory: 'Factory_1', line: 'Production_Line_1', machine: 'Machine_1',
  ts: 1792153500000, session_start: 1792150000000, session_end: null,
  availability: 0.8, performance: 1.0, quality: 0.95, oee: 0.76,
  total: 480, reject: 24, no_data_seconds: 0, gap_parts: 0,
};
const send = (o) => parseOee(JSON.stringify(o));

test('sözleşmedeki örnek mesaj kabul edilir', () => {
  assert.deepEqual(send(good), good);
});

test('performance ve quality null olabilir', () => {
  const m = { ...good, availability: 0, performance: null, quality: null, oee: 0, total: 0, reject: 0 };
  assert.deepEqual(send(m), m);
});

test('kapanmış oturum: session_end dolu kabul edilir', () => {
  assert.ok(send({ ...good, session_end: 1792153400000 }));
});

test('oranlar 0–1 dışında ya da yanlış tipte ise reddedilir', () => {
  assert.equal(send({ ...good, availability: 80 }), null); // yüzde gönderilmiş
  assert.equal(send({ ...good, quality: -0.1 }), null);
  assert.equal(send({ ...good, oee: '0.76' }), null);
  assert.equal(send({ ...good, availability: null }), null); // availability hep sayı
  assert.equal(send({ ...good, oee: null }), null);
});

test('zaman alanları milisaniye olmalı, oturum sonu başından önce olamaz', () => {
  assert.equal(send({ ...good, ts: 1792153500 }), null);
  assert.equal(send({ ...good, session_start: 1792150000 }), null);
  assert.equal(send({ ...good, session_end: 1792140000000 }), null);
});

test('sayılar negatif olmayan tam sayı olmalı', () => {
  assert.equal(send({ ...good, total: -1 }), null);
  assert.equal(send({ ...good, reject: 2.5 }), null);
  assert.equal(send({ ...good, gap_parts: -3 }), null);
  assert.equal(send({ ...good, no_data_seconds: -1 }), null);
});

test('bozuk ya da eksik mesaj reddedilir, çökmez', () => {
  assert.equal(parseOee('{bozuk'), null);
  assert.equal(parseOee('null'), null);
  assert.equal(parseOee('[]'), null);
  const { total: _t, ...missing } = good;
  assert.equal(send(missing), null);
});

test('hatalı toplamdan büyük gelebilir (sözleşmeye göre geçerli)', () => {
  assert.ok(send({ ...good, total: 10, reject: 12, quality: 0, oee: 0 }));
});

// --- İnceleme istekleri ---

test('uymayan mesajda hangi alanın sorunlu olduğu söylenir', () => {
  assert.equal(checkOee(JSON.stringify({ ...good, availability: 80 })).error, 'availability 0–1 arasında sayı olmalı');
  assert.equal(checkOee(JSON.stringify({ ...good, ts: 1792153500 })).error, 'ts milisaniye cinsinden zaman olmalı');
  const { gap_parts: _g, ...missing } = good;
  assert.equal(checkOee(JSON.stringify(missing)).error, 'gap_parts alanı eksik');
  assert.equal(checkOee('{bozuk').error, 'JSON okunamadı');
  assert.equal(checkOee(JSON.stringify(good)).error, null);
});

test('kesinti notu: no_data_seconds >= 1 ya da gap_parts > 0', () => {
  assert.equal(hasGapNote({ ...good, no_data_seconds: 0, gap_parts: 0 }), false);
  assert.equal(hasGapNote({ ...good, no_data_seconds: 0.4, gap_parts: 0 }), false); // "0 sn veri yok" çıkmasın
  assert.equal(hasGapNote({ ...good, no_data_seconds: 1, gap_parts: 0 }), true);
  assert.equal(hasGapNote({ ...good, no_data_seconds: 0, gap_parts: 3 }), true);
  assert.equal(hasGapNote(null), false);
});

test('kesinti notu: parça 0 ise parça kısmı yazılmaz', () => {
  assert.equal(gapNoteText({ ...good, no_data_seconds: 86, gap_parts: 0 }), 'Veri kesintisi: 1 dk 26 sn veri yok');
  assert.equal(
    gapNoteText({ ...good, no_data_seconds: 86, gap_parts: 69 }),
    'Veri kesintisi: 1 dk 26 sn veri yok · kesintide üretilen 69 parça OEE dışında',
  );
  assert.equal(gapNoteText({ ...good, no_data_seconds: 0, gap_parts: 5 }), 'Veri kesintisi: kesintide üretilen 5 parça OEE dışında');
  assert.equal(gapNoteText({ ...good, no_data_seconds: 0.4, gap_parts: 0 }), null);
});
