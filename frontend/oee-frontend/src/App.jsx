import { useState, useEffect } from 'react';
import { useMachineStream } from './hooks/useMachineStream';
import RateGauge from './components/RateGauge';
import OeeGauge from './components/OeeGauge';
import PlantTree from './components/PlantTree';
import { PLANT_TREE } from './data/plantTree';
import { readMockOptions } from './lib/mockSource';
import { formatPercent } from './lib/gauge';
import { formatClock, formatDuration } from './lib/format';
import { RatesTrend, ProductionTrend } from './components/TrendCharts';
import { TREND_SAMPLE, TREND_STEP_MS } from './data/trendSample';
import './App.css';

const STREAM_URL = import.meta.env.VITE_STREAM_URL || 'mock';
const IS_MOCK = STREAM_URL === 'mock';

// Güneş simgesi (karanlık moddayken gösterilir: "açık moda dön")
function GunesSimgesi() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

// Ay simgesi (açık moddayken gösterilir: "karanlık moda geç")
function AySimgesi() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function App() {
  // Sayfa her zaman açık temayla başlar
  const [karanlik, setKaranlik] = useState(false);
  const [seciliMakine, setSeciliMakine] = useState('Machine_1');
  // Sahte veri seçenekleri (yalnızca VITE_STREAM_URL=mock iken): ?a=…&p=…&q=…, ?oturum=kapali, ?kesinti=1
  const [mockOptions] = useState(() => readMockOptions(window.location.search));
  const { latest, perMinute, connection, stale, silentFor, oee, oeeStale } = useMachineStream(
    STREAM_URL,
    mockOptions,
  );

  // Tema değişince <html> etiketine data-theme yaz, CSS renkleri buna göre değişir
  useEffect(() => {
    document.documentElement.dataset.theme = karanlik ? 'dark' : 'light';
  }, [karanlik]);

  // Uyarı metni: önce bağlantı hatası, sonra veri kesintisi
  let uyari = null;
  if (connection === 'error') {
    uyari = 'Backend bağlantısı koptu, yeniden bağlanılıyor…';
  } else if (stale) {
    uyari = `${Math.floor(silentFor / 1000)} saniyedir yeni veri gelmiyor. ESP32 veya broker durmuş olabilir.`;
  }

  // Bağlantı koptuysa ya da 10 sn'dir veri yoksa son değerler artık güncel değil:
  // Gauge ve sayaç kutuları soluk, durumda "Veri yok"
  const veriYok = connection === 'error' || stale || !latest;
  const soluk = veriYok ? 'soluk' : undefined;
  const calisiyor = latest?.status === true;

  let durumMetni = 'Veri yok';
  let durumSinifi = 'durum-veri-yok';
  if (!veriYok) {
    durumMetni = calisiyor ? 'Çalışıyor' : 'Duruşta';
    durumSinifi = calisiyor ? 'durum-calisiyor' : 'durum-durusta';
  }

  // OEE değerleri backend'in "event: oee" mesajından. Bağlantı koptuysa ya da
  // 15 sn'dir OEE mesajı gelmediyse değerler soluk gösterilir.
  const oeeVeriYok = connection === 'error' || oeeStale;
  const oeeSoluk = oeeVeriYok ? 'soluk' : undefined;
  const oturumKapali = oee?.session_end != null;
  const kesintiVar = oee && (oee.no_data_seconds > 0 || oee.gap_parts > 0);

  return (
    <div className="sayfa">
      <button
        className="tema-butonu"
        onClick={() => setKaranlik(!karanlik)}
        aria-label={karanlik ? 'Açık moda geç' : 'Karanlık moda geç'}
        title={karanlik ? 'Açık moda geç' : 'Karanlık moda geç'}
      >
        {karanlik ? <GunesSimgesi /> : <AySimgesi />}
      </button>

      <aside className="yan-menu">
        <PlantTree nodes={PLANT_TREE} selectedId={seciliMakine} onSelect={setSeciliMakine} />
      </aside>

      <main className="kapsayici">
        <h1>OEE Gösterge Paneli</h1>
        {/* Her metin kendi <span>'ında ve ayrı key'le: çeviri eklentileri düz metin
            düğümlerini değiştirse bile React eski düğümü değil, yeni bir öğe çizer.
            Topic adları (Factory_1 vb.) çevrilmesin diye translate="no". */}
        <p className="makine-adi">
          {latest ? (
            <span key="yol" translate="no">
              {`${latest.factory} / ${latest.line} / ${latest.machine}`}
            </span>
          ) : (
            <span key="bekleniyor">Veri bekleniyor…</span>
          )}
          {IS_MOCK && <span className="etiket">sahte veri</span>}
        </p>

        {uyari && (
          <div className="uyari" role="alert">
            {uyari}
          </div>
        )}

        <section className="bolum" aria-labelledby="canli-baslik">
          <h2 id="canli-baslik">Canlı üretim</h2>
          <div className="canli">
            <div className={soluk} style={{ width: '100%' }}>
              <RateGauge value={perMinute} dark={karanlik} />
            </div>

            <dl className="bilgiler">
              {/* Oturumun OEE hesabındaki Toplam ve Hatalı (ham sayaç değil) */}
              <div className={oeeSoluk}>
                <dt>Toplam üretim</dt>
                <dd>{oee ? oee.total.toLocaleString('tr-TR') : '—'}</dd>
              </div>
              <div className={oeeSoluk}>
                <dt>Hatalı üretim</dt>
                <dd>{oee ? oee.reject.toLocaleString('tr-TR') : '—'}</dd>
              </div>
              <div>
                <dt>Makine durumu</dt>
                <dd className={durumSinifi}>{durumMetni}</dd>
              </div>
            </dl>

            {oee && (
              <div className="oturum">
                <p>
                  <span key={`bas-${oee.session_start}`}>Oturum başlangıcı: {formatClock(oee.session_start)}</span>
                  {oturumKapali && (
                    <span key="kapandi" className="etiket oturum-kapandi">
                      Oturum kapandı · {formatClock(oee.session_end)}
                    </span>
                  )}
                </p>
                {kesintiVar && (
                  <p key="kesinti" className="kesinti-notu">
                    Veri kesintisi: {formatDuration(oee.no_data_seconds)} veri yok · kesintide üretilen{' '}
                    {oee.gap_parts.toLocaleString('tr-TR')} parça OEE dışında
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="bolum" aria-labelledby="oee-baslik">
          <h2 id="oee-baslik">OEE {oturumKapali && <span className="etiket">son oturum</span>}</h2>
          <div className={oeeSoluk}>
            <div className="oee-grid">
              <OeeGauge title="Availability" value={oee?.availability ?? null} dark={karanlik} />
              <OeeGauge title="Performance" value={oee?.performance ?? null} dark={karanlik} />
              <OeeGauge title="Quality" value={oee?.quality ?? null} dark={karanlik} />
            </div>
            <p className="oee-toplam">
              OEE = A × P × Q = <strong key={`oee-${oee?.oee}`}>{formatPercent(oee?.oee ?? null)}</strong>
            </p>
          </div>
          <p className="renk-aciklama">
            <span className="nokta kirmizi" /> %70 altı <span className="nokta sari" /> %70–85{' '}
            <span className="nokta yesil" /> %85 ve üstü
          </p>
        </section>

        <section className="bolum" aria-labelledby="trend-baslik">
          <h2 id="trend-baslik">
            Trend <span className="etiket">örnek veri</span>
          </h2>
          <h3 className="grafik-baslik">OEE, Availability, Performance ve Quality (5 dk aralıklarla)</h3>
          <RatesTrend rows={TREND_SAMPLE} dark={karanlik} />
          <h3 className="grafik-baslik">Üretim adedi (parça / 5 dk)</h3>
          <ProductionTrend rows={TREND_SAMPLE} dark={karanlik} stepMinutes={TREND_STEP_MS / 60000} />
          <details className="tablo-gorunumu">
            <summary>Tablo olarak göster</summary>
            <table>
              <thead>
                <tr>
                  <th>Saat</th>
                  <th>OEE</th>
                  <th>A</th>
                  <th>P</th>
                  <th>Q</th>
                  <th>Parça</th>
                </tr>
              </thead>
              <tbody>
                {TREND_SAMPLE.map((r) => (
                  <tr key={r.ts}>
                    <td>{formatClock(r.ts, r.ts)}</td>
                    <td>{formatPercent(r.oee)}</td>
                    <td>{formatPercent(r.availability)}</td>
                    <td>{formatPercent(r.performance)}</td>
                    <td>{formatPercent(r.quality)}</td>
                    <td>{r.parts === null ? 'veri yok' : r.parts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </main>
    </div>
  );
}

export default App;
