import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gaugeColor, formatPercent, toPercent, GAUGE_COLORS } from '../src/lib/gauge.js';
import { readSampleOee, SAMPLE_OEE } from '../src/lib/oeeSample.js';

const { red, yellow, green } = GAUGE_COLORS;

test('bitirme kriteri: %65 kırmızı, %76 sarı, %95 yeşil', () => {
  assert.equal(gaugeColor(0.65), red);
  assert.equal(gaugeColor(0.76), yellow);
  assert.equal(gaugeColor(0.95), green);
});

test('sınırlar: tam %70 sarı, tam %85 yeşil', () => {
  assert.equal(gaugeColor(0.7), yellow);
  assert.equal(gaugeColor(0.85), green);
  assert.equal(gaugeColor(0.699), red); // ekranda %69,9
  assert.equal(gaugeColor(0.849), yellow); // ekranda %84,9
});

test('hesaptan gelen kayan nokta değerleri ekrandaki yüzdeye göre renklenir', () => {
  assert.equal(gaugeColor(0.1 * 7), yellow); // 0.7000000000000001 → %70,0
  assert.equal(gaugeColor(0.85 - 1e-12), green); // %85,0
});

test('yüzde biçimi tek ondalık, 0–1 dışı değerler sınırlanır', () => {
  assert.equal(formatPercent(0.76), '%76,0');
  assert.equal(formatPercent(0.8 * 1 * 0.95), '%76,0');
  assert.equal(formatPercent(1.2), '%100,0');
  assert.equal(formatPercent(-0.1), '%0,0');
  assert.equal(formatPercent(null), '—');
  assert.equal(toPercent(0.12345), 12.3);
});

test('örnek OEE değerleri adres çubuğundan okunur', () => {
  assert.deepEqual(readSampleOee(''), SAMPLE_OEE);
  assert.deepEqual(readSampleOee('?a=0.65&p=0.76&q=0.95'), { availability: 0.65, performance: 0.76, quality: 0.95 });
  assert.deepEqual(readSampleOee('?a=0,7&p=abc&q=2'), { availability: 0.7, performance: SAMPLE_OEE.performance, quality: SAMPLE_OEE.quality });
});
