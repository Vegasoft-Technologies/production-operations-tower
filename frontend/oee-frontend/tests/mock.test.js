import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockState, mockStep } from '../src/lib/mockSource.js';
import { counterStep } from '../src/lib/counter.js';

// 600 saniye çalıştırıp sahte verinin PLC gibi davrandığını doğrula
function run(seconds) {
  let state = createMockState();
  const statuses = [];
  let total = 0;
  let reject = 0;
  let prev = state;
  for (let i = 0; i < seconds; i++) {
    const r = mockStep(state);
    state = r.state;
    statuses.push(r.running);
    total += counterStep(prev.total, state.total, i * 1000, (i + 1) * 1000).inc;
    reject += counterStep(prev.reject, state.reject, i * 1000, (i + 1) * 1000).inc;
    prev = state;
  }
  return { statuses, total, reject, produced: state.produced };
}

test('8 sn çalışır, 2 sn durur', () => {
  const { statuses } = run(20);
  const pattern = [true, true, true, true, true, true, true, true, false, false];
  assert.deepEqual(statuses, [...pattern, ...pattern]);
});

test('10 dakikada 480 parça, her 20. parça hatalı → 24 hatalı', () => {
  const { produced, total, reject } = run(600);
  assert.equal(produced, 480);
  assert.equal(reject, 24);
  // Sayaç 32760'tan başladığı için bir kez 32767 → 0 geçişi var; sözleşmeye göre
  // bu geçiş parça sayılmaz, sayaçtan okunan toplam 479 olur (PLC'de de böyle).
  assert.equal(total, 479);
});
