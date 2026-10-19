// Neşe'nin backend'i olmadan çalışmak için sahte veri kaynağı.
// PLC gibi davranır: 8 sn çalışır, 2 sn durur; çalışırken saniyede 1 parça,
// her 20. parça hatalı. Sayaç 32760'tan başlar, başa dönüş hemen test edilir.
// Ayrıca 5 sn'de bir sabit örnek değerlerle "oee" mesajı gönderir (OEE hesaplamaz).

import { SAMPLE_OEE, readSampleOee } from './oeeSample.js';

// Gerçek PLC'de sayaç 32767'ye ulaştığı anda 0'a döner; okumada 32766'dan sonra
// doğrudan 0 görülür. Artış formülü (mod 32767) bu adımı 1 parça sayar, parça kaybolmaz.
const LAST_VISIBLE = 32766;
const wrap = (v) => (v >= LAST_VISIBLE ? 0 : v + 1);

const MACHINE = { factory: 'Factory_1', line: 'Production_Line_1', machine: 'Machine_1' };
const SESSION_TOTAL = 480; // 10 dakikalık örnek oturum
const SESSION_MS = 10 * 60 * 1000;
const OEE_EVERY_MS = 5000;

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

// Ekran görüntüsü / deneme için adres çubuğu seçenekleri:
//   ?a=0.65&p=0.76&q=0.95  oranlar
//   ?oturum=kapali         session_end dolu gönderilir
//   ?kesinti=1             oturumda veri kesintisi varmış gibi (86 sn, 69 parça)
export function readMockOptions(search = '') {
  const params = new URLSearchParams(search);
  return {
    ...readSampleOee(search),
    closed: params.get('oturum') === 'kapali',
    gap: params.get('kesinti') === '1',
  };
}

// Sözleşmedeki biçimde sabit örnek OEE mesajı.
// reject, Quality ile tutarlı seçilir: (total - reject) / total = quality
export function mockOeeMessage(options = SAMPLE_OEE, sessionStart, now) {
  const { availability, performance, quality } = { ...SAMPLE_OEE, ...options };
  const total = SESSION_TOTAL;
  const reject = Math.round(total * (1 - quality));
  return {
    ...MACHINE,
    ts: now,
    session_start: sessionStart,
    session_end: options.closed ? sessionStart + SESSION_MS : null,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    total,
    reject,
    no_data_seconds: options.gap ? 86 : 0,
    gap_parts: options.gap ? 69 : 0,
  };
}

export function startMockSource(onMessage, onOee, options = SAMPLE_OEE) {
  let state = createMockState();
  // Oturum 10 dk önce başlamış gibi
  const sessionStart = Date.now() - SESSION_MS;
  const sendOee = () => onOee?.(JSON.stringify(mockOeeMessage(options, sessionStart, Date.now())));

  const timer = setInterval(() => {
    const result = mockStep(state);
    state = result.state;
    onMessage(
      JSON.stringify({
        ...MACHINE,
        ts: Date.now(),
        status: result.running,
        total_count: state.total,
        reject_count: state.reject,
      }),
    );
  }, 1000);

  sendOee();
  const oeeTimer = setInterval(sendOee, OEE_EVERY_MS);

  return () => {
    clearInterval(timer);
    clearInterval(oeeTimer);
  };
}
