import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTelemetry, isMillisecondTimestamp } from '../src/lib/telemetry.js';

const good = { factory: 'Factory_1', line: 'Production_Line_1', machine: 'Machine_1', ts: 1760180400000, status: true, total_count: 1234, reject_count: 61 };

test('bozuk ya da eksik mesajlar reddedilir', () => {
  assert.deepEqual(parseTelemetry(JSON.stringify(good)), good);
  assert.deepEqual(parseTelemetry(JSON.stringify({ topic: 'x', payload: good })), good);
  assert.equal(parseTelemetry('{bozuk json'), null);
  assert.equal(parseTelemetry(JSON.stringify({ ...good, status: 1 })), null);
  assert.equal(parseTelemetry(JSON.stringify({ ...good, total_count: '12' })), null);
  const { reject_count: _r, ...missing } = good;
  assert.equal(parseTelemetry(JSON.stringify(missing)), null);
});

test('ts milisaniye olmalı, saniye gelirse mesaj reddedilir', () => {
  assert.equal(isMillisecondTimestamp(1760180400000), true);
  assert.equal(isMillisecondTimestamp(1760180400), false);
  assert.equal(isMillisecondTimestamp(1760180400000.5), false);
  assert.equal(isMillisecondTimestamp('1760180400000'), false);
  assert.equal(parseTelemetry(JSON.stringify({ ...good, ts: 1760180400 })), null);
});
