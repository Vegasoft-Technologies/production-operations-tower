import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatClock, staleWarning } from '../src/lib/format.js';
import { findGaps, ratioToPct } from '../src/lib/trend.js';

test('süre biçimi', () => {
  assert.equal(formatDuration(0), '0 sn');
  assert.equal(formatDuration(45), '45 sn');
  assert.equal(formatDuration(86), '1 dk 26 sn');
  assert.equal(formatDuration(120), '2 dk');
  assert.equal(formatDuration(3720), '1 sa 2 dk');
  assert.equal(formatDuration(7200), '2 sa');
});

test('saat biçimi: aynı gün yalnız saat, farklı gün tarih + saat', () => {
  const t = new Date(2026, 9, 20, 14, 5).getTime();
  assert.equal(formatClock(t, new Date(2026, 9, 20, 18, 0).getTime()), '14:05');
  assert.match(formatClock(t, new Date(2026, 9, 21, 9, 0).getTime()), /^20 Eki 14:05$/);
});

test('trend: null aralıkları "veri yok" bandına dönüşür', () => {
  const rows = [
    { ts: 1, v: 1 }, { ts: 2, v: null }, { ts: 3, v: null }, { ts: 4, v: 1 }, { ts: 5, v: null },
  ];
  assert.deepEqual(findGaps(rows, 'v'), [[1, 4], [4, 5]]);
  assert.deepEqual(findGaps([{ ts: 1, v: 1 }], 'v'), []);
});

test('trend: oran yüzdeye çevrilir, null korunur', () => {
  assert.equal(ratioToPct(0.76), 76);
  assert.equal(ratioToPct(0.8 * 1 * 0.95), 76);
  assert.equal(ratioToPct(null), null);
});


test('veri kesintisi uyarısı süreyi okunur yazar', () => {
  assert.equal(staleWarning(3_600_000), '1 sa boyunca yeni veri gelmedi. ESP32 veya broker durmuş olabilir.');
  assert.match(staleWarning(11_400), /^11 sn boyunca/);
  assert.match(staleWarning(125_000), /^2 dk 5 sn boyunca/);
});
