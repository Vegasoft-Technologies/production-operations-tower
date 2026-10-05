import { useEffect, useRef, useState } from 'react';
import { counterIncrement, sumWindow } from '../lib/counter';
import { parseTelemetry } from '../lib/telemetry';
import { startMockSource } from '../lib/mockSource';

const STALE_MS = 10_000; // bu süre veri gelmezse uyarı
const WINDOW_MS = 60_000; // Gauge: son 60 saniye

// SSE (EventSource) ile makine verisini dinler.
// url boşsa ya da 'mock' ise sahte kaynak kullanılır.
export function useMachineStream(url) {
  const [latest, setLatest] = useState(null);
  const [perMinute, setPerMinute] = useState(0);
  const isMock = !url || url === 'mock';
  // connecting | open | error — sahte kaynak her zaman "açık"
  const [connection, setConnection] = useState(isMock ? 'open' : 'connecting');
  const [lastArrival, setLastArrival] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());

  const prevRef = useRef(null); // bir önceki mesaj
  const entriesRef = useRef([]); // [{ ts, inc }]

  useEffect(() => {
    const handle = (raw) => {
      const msg = parseTelemetry(raw);
      if (!msg) {
        console.warn('Sözleşmeye uymayan mesaj atlandı:', raw);
        return;
      }
      console.log('Veri geldi:', msg);

      const prev = prevRef.current;
      if (prev) {
        const inc = counterIncrement(prev.total_count, msg.total_count);
        entriesRef.current.push({ ts: msg.ts, inc });
        // 60 sn'den eski kayıtları at
        entriesRef.current = entriesRef.current.filter((e) => e.ts > msg.ts - WINDOW_MS);
        setPerMinute(sumWindow(entriesRef.current, msg.ts, WINDOW_MS));
      }
      prevRef.current = msg;
      setLatest(msg);
      setLastArrival(Date.now());
    };

    if (isMock) {
      return startMockSource(handle);
    }

    const es = new EventSource(url);
    es.onopen = () => setConnection('open');
    es.onmessage = (event) => handle(event.data);
    // Backend kapanınca tarayıcı otomatik yeniden dener; o sırada uyarı gösteririz
    es.onerror = () => setConnection('error');

    // Temizlik: bileşen kapanınca bağlantıyı kapat
    return () => es.close();
  }, [url, isMock]);

  // Her saniye saati güncelle → "10 sn'dir veri yok" kontrolü
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const silentFor = now - (lastArrival ?? startedAt);
  const stale = silentFor > STALE_MS;

  return { latest, perMinute, connection, stale, silentFor };
}
