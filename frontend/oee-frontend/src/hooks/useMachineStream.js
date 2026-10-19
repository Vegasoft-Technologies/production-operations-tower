import { useEffect, useRef, useState } from 'react';
import { counterStep, sumWindow } from '../lib/counter';
import { parseTelemetry } from '../lib/telemetry';
import { parseOee } from '../lib/oeeMessage';
import { startMockSource } from '../lib/mockSource';

const STALE_MS = 10_000; // bu süre veri gelmezse uyarı
const WINDOW_MS = 60_000; // Gauge: son 60 saniye
const RETRY_MS = 3_000; // tarayıcı yeniden denemeyi bırakırsa biz bu aralıkla yeniden açarız
const OEE_STALE_MS = 15_000; // OEE 5 sn'de bir gelir; 3 mesaj kaçarsa değerler eski sayılır

// SSE (EventSource) ile makine verisini ve OEE'yi dinler.
// İsimsiz mesajlar: makine verisi (onmessage). "event: oee": oturum OEE değerleri.
// url boşsa ya da 'mock' ise sahte kaynak kullanılır (mockOptions ile).
export function useMachineStream(url, mockOptions) {
  const [latest, setLatest] = useState(null);
  const [oee, setOee] = useState(null);
  const [lastOeeArrival, setLastOeeArrival] = useState(null);
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
      const prev = prevRef.current;
      if (prev) {
        const { inc, outage } = counterStep(prev.total_count, msg.total_count, prev.ts, msg.ts);
        // Kesinti adımı (10 sn'den uzun ara) ve bilinmeyen artış "son 60 sn"ye girmez
        if (!outage && inc !== null) {
          entriesRef.current.push({ ts: msg.ts, inc });
        }
        // 60 sn'den eski kayıtları at
        entriesRef.current = entriesRef.current.filter((e) => e.ts > msg.ts - WINDOW_MS);
        setPerMinute(sumWindow(entriesRef.current, msg.ts, WINDOW_MS));
      }
      prevRef.current = msg;
      setLatest(msg);
      setLastArrival(Date.now());
    };

    const handleOee = (raw) => {
      const msg = parseOee(raw);
      if (!msg) {
        console.warn('Sözleşmeye uymayan OEE mesajı atlandı:', raw);
        return;
      }
      setOee(msg);
      setLastOeeArrival(Date.now());
    };

    if (isMock) {
      return startMockSource(handle, handleOee, mockOptions);
    }

    let es = null;
    let retryTimer = null;
    let stopped = false;

    const connect = () => {
      es = new EventSource(url);
      es.onopen = () => setConnection('open');
      es.onmessage = (event) => handle(event.data); // isimsiz olay: makine verisi
      es.addEventListener('oee', (event) => handleOee(event.data));
      es.onerror = () => {
        setConnection('error');
        // Ağ kesintisinde tarayıcı kendisi yeniden dener (readyState = CONNECTING).
        // Ama backend hata kodu (ör. 503) döner ya da CORS eksikse bağlantıyı
        // tamamen kapatır (readyState = CLOSED). O zaman biz yeniden açarız.
        if (es.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          retryTimer = setTimeout(connect, RETRY_MS);
        }
      };
    };

    connect();

    // Temizlik: bileşen kapanınca bağlantıyı ve bekleyen denemeyi kapat
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [url, isMock, mockOptions]);

  // Her saniye saati güncelle → "10 sn'dir veri yok" kontrolü
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const silentFor = now - (lastArrival ?? startedAt);
  const stale = silentFor > STALE_MS;

  const oeeStale = lastOeeArrival === null || now - lastOeeArrival > OEE_STALE_MS;

  return { latest, perMinute, connection, stale, silentFor, oee, oeeStale };
}
