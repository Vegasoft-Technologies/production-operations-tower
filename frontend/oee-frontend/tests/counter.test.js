import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterIncrement, sumWindow } from '../src/lib/counter.js';
import { parseTelemetry } from '../src/lib/telemetry.js';

test('normal artış', () => {
  assert.equal(counterIncrement(1234, 1235), 1);
  assert.equal(counterIncrement(1234, 1234), 0);
  assert.equal(counterIncrement(100, 103), 3);
});

test('32767 → 0 geçişi parça sayılmaz', () => {
  assert.equal(counterIncrement(32767, 0), 0);
  assert.equal(counterIncrement(32766, 0), 1); // 32766→32767 (+1), 32767→0 (+0)
  assert.equal(counterIncrement(32767, 2), 2);
});

test('PLC yeniden başlarsa (artış > 5) 0 sayılır', () => {
  assert.equal(counterIncrement(1234, 0), 0);
  assert.equal(counterIncrement(1234, 3), 0);
  assert.equal(counterIncrement(100, 106), 0);
  assert.equal(counterIncrement(100, 105), 5);
});

test('son 60 saniyenin toplamı', () => {
  const entries = [
    { ts: 1000, inc: 1 },
    { ts: 30_000, inc: 1 },
    { ts: 61_000, inc: 1 },
  ];
  assert.equal(sumWindow(entries, 61_000), 2); // ts=1000 pencerenin dışında
});

test('bozuk ya da eksik mesajlar reddedilir', () => {
  const good = { factory: 'Factory_1', line: 'Production_Line_1', machine: 'Machine_1', ts: 1760180400000, status: true, total_count: 1234, reject_count: 61 };
  assert.deepEqual(parseTelemetry(JSON.stringify(good)), good);
  assert.deepEqual(parseTelemetry(JSON.stringify({ topic: 'x', payload: good })), good);
  assert.equal(parseTelemetry('{bozuk json'), null);
  assert.equal(parseTelemetry(JSON.stringify({ ...good, status: 1 })), null);
  assert.equal(parseTelemetry(JSON.stringify({ ...good, total_count: '12' })), null);
  const { reject_count: _r, ...missing } = good;
  assert.equal(parseTelemetry(JSON.stringify(missing)), null);
});
