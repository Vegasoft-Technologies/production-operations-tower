// Neşe'nin backend'i olmadan çalışmak için sahte veri kaynağı.
// PLC gibi davranır: 8 sn çalışır, 2 sn durur; çalışırken saniyede 1 parça,
// her 20. parça hatalı. Sayaç 32760'tan başlar, 32767 → 0 geçişi hemen test edilir.

const COUNTER_MAX = 32767;
const wrap = (v) => (v >= COUNTER_MAX ? 0 : v + 1);

export function createMockState() {
  return { tick: 0, produced: 0, total: 32760, reject: 30 };
}

// Bir saniyelik adım: yeni durumu ve o anki makine durumunu döner.
export function mockStep(state) {
  const running = state.tick % 10 < 8; // 0–7 çalışıyor, 8–9 duruşta
  const next = { ...state, tick: state.tick + 1 };
  if (running) {
    next.produced = state.produced + 1;
    next.total = wrap(state.total);
    if (next.produced % 20 === 0) next.reject = wrap(state.reject);
  }
  return { state: next, running };
}

export function startMockSource(onMessage) {
  let state = createMockState();

  const timer = setInterval(() => {
    const result = mockStep(state);
    state = result.state;
    onMessage(
      JSON.stringify({
        factory: 'Factory_1',
        line: 'Production_Line_1',
        machine: 'Machine_1',
        ts: Date.now(),
        status: result.running,
        total_count: state.total,
        reject_count: state.reject,
      }),
    );
  }, 1000);

  return () => clearInterval(timer);
}
