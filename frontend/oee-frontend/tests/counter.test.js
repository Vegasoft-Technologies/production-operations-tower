import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterStep, rawIncrement, sumWindow } from '../src/lib/counter.js';

const T0 = 1760180400000; // örnek ts (ms)
const s = (n) => T0 + n * 1000; // T0'dan n saniye sonra

// Bir değer dizisinin (her eleman [saniye, değer]) toplam artışı
function totalOf(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    const { inc } = counterStep(v0, v1, s(t0), s(t1));
    if (inc !== null) sum += inc;
  }
  return sum;
}

// --- Neşe'nin sayaç testleriyle aynı beş senaryo (backend ile aynı sonucu vermeli) ---

test('32766 → 32767 → 0 → 1 dizisinde toplam artış 2', () => {
  assert.equal(totalOf([[0, 32766], [1, 32767], [2, 0], [3, 1]]), 2);
});

test('32766\'dan 1 sn sonra 0 gelirse artış 1', () => {
  assert.deepEqual(counterStep(32766, 0, s(0), s(1)), { inc: 1, outage: false });
});

test('total_count 1 sn içinde 1517\'den 3\'e düşerse artış 0 (sıfırlanma)', () => {
  assert.deepEqual(counterStep(1517, 3, s(0), s(1)), { inc: 0, outage: false });
});

test('1517\'den 86 sn sonra 1586: artış 69 ama adım kesinti', () => {
  assert.deepEqual(counterStep(1517, 1586, s(0), s(86)), { inc: 69, outage: true });
});

test('1517\'den 2 saat sonra 40: artış bilinmiyor (null)', () => {
  const step = counterStep(1517, 40, s(0), s(2 * 3600));
  assert.equal(step.inc, null);
  assert.equal(step.outage, true);
  assert.equal(totalOf([[0, 1517], [2 * 3600, 40]]), 0); // toplama eklenmez
});

// --- Ek kontroller ---

test('ham artış formülü', () => {
  assert.equal(rawIncrement(1234, 1235), 1);
  assert.equal(rawIncrement(32767, 0), 0);
  assert.equal(rawIncrement(32767, 2), 2);
});

test('sınır geçen süreye bağlı: 1 sn\'de 5\'e kadar, 6 sıfırlanma', () => {
  assert.equal(counterStep(100, 105, s(0), s(1)).inc, 5);
  assert.equal(counterStep(100, 106, s(0), s(1)).inc, 0);
});

test('süre yukarı yuvarlanır: 1,2 sn → sınır 6', () => {
  assert.equal(counterStep(100, 106, s(0), s(1.2)).inc, 6);
});

test('tam 10 sn kesinti değil, 10 sn\'den fazlası kesinti', () => {
  assert.equal(counterStep(100, 108, s(0), s(10)).outage, false);
  assert.equal(counterStep(100, 109, s(0), s(10.5)).outage, true);
});

test('son 60 saniyenin toplamı', () => {
  const entries = [
    { ts: 1000, inc: 1 },
    { ts: 30_000, inc: 1 },
    { ts: 61_000, inc: 1 },
  ];
  assert.equal(sumWindow(entries, 61_000), 2); // ts=1000 pencerenin dışında
});
