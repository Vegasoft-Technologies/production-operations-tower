// Neşe'nin backend'i hazır olmadan çalışmak için sahte veri kaynağı.
// Sözleşmedeki JSON'un aynısını saniyede bir üretir.
// Sayaç 32760'tan başlar, böylece 32767 → 0 geçişi ilk saniyelerde test edilir.
export function startMockSource(onMessage) {
  let total = 32760;
  let reject = 30;
  let tick = 0;

  const timer = setInterval(() => {
    tick += 1;
    const running = tick % 40 < 30; // 30 sn çalışır, 10 sn durur
    if (running) {
      total = total >= 32767 ? 0 : total + 1;
      if (tick % 20 === 0) reject = reject >= 32767 ? 0 : reject + 1;
    }
    onMessage(
      JSON.stringify({
        factory: 'Factory_1',
        line: 'Production_Line_1',
        machine: 'Machine_1',
        ts: Date.now(),
        status: running,
        total_count: total,
        reject_count: reject,
      }),
    );
  }, 1000);

  return () => clearInterval(timer);
}
