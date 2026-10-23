import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockState, mockStep, mockOeeMessage, readMockOptions } from '../src/lib/mockSource.js';
import { counterStep } from '../src/lib/counter.js';
import { parseOee } from '../src/lib/oeeMessage.js';

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
  // Sayaç 32760'tan başladığı için başa dönüş var; PLC gibi 32766 → 0 geçtiği için
  // hiçbir parça kaybolmaz, sayaçtan okunan toplam da 480.
  assert.equal(total, 480);
});

test('başa dönüşte 32767 hiç görünmez, 32766\'dan sonra 0 gelir', () => {
  let state = { ...createMockState(), total: 32765 };
  const seen = [];
  for (let i = 0; i < 4; i++) {
    state = mockStep(state).state;
    seen.push(state.total);
  }
  assert.deepEqual(seen, [32766, 0, 1, 2]);
});

// --- Sahte OEE mesajı ---

const START = 1792150000000;
const NOW = START + 10 * 60 * 1000;

test('sahte OEE mesajı sözleşmeye uyar ve sabit örnek değerleri taşır', () => {
  const m = mockOeeMessage(readMockOptions(''), START, NOW);
  assert.deepEqual(parseOee(JSON.stringify(m)), m);
  assert.equal(m.availability, 0.8);
  assert.equal(m.performance, 1);
  assert.equal(m.quality, 0.95);
  assert.equal(Math.round(m.oee * 1000) / 1000, 0.76);
  assert.equal(m.session_end, null);
});

test('kartlar Quality ile uyuşur: (Toplam − Hatalı) ÷ Toplam = Quality', () => {
  for (const q of ['0.95', '0.75', '0.5']) {
    const m = mockOeeMessage(readMockOptions(`?q=${q}`), START, NOW);
    assert.equal((m.total - m.reject) / m.total, Number(q));
  }
});

test('?oturum=kapali ve ?kesinti=1 seçenekleri', () => {
  const m = mockOeeMessage(readMockOptions('?oturum=kapali&kesinti=1'), START, NOW);
  assert.ok(m.session_end > START);
  assert.equal(m.no_data_seconds, 86);
  assert.equal(m.gap_parts, 69);
  assert.ok(parseOee(JSON.stringify(m)));
});
