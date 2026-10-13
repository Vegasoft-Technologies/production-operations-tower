import { useState, useEffect } from 'react';
import { useMachineStream } from './hooks/useMachineStream';
import RateGauge from './components/RateGauge';
import OeeGauge from './components/OeeGauge';
import PlantTree from './components/PlantTree';
import { PLANT_TREE } from './data/plantTree';
import { readSampleOee } from './lib/oeeSample';
import { formatPercent } from './lib/gauge';
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
  // Bu hafta örnek OEE değerleri; Hafta 4'te backend'den gelecek
  const [oee] = useState(() => readSampleOee(window.location.search));
  const { latest, perMinute, connection, stale, silentFor } = useMachineStream(STREAM_URL);

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

  const oeeToplam = oee.availability * oee.performance * oee.quality;

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
        <p className="makine-adi">
          {latest ? `${latest.factory} / ${latest.line} / ${latest.machine}` : 'Veri bekleniyor…'}
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
              <div className={soluk}>
                <dt>Toplam üretim</dt>
                <dd>{latest ? latest.total_count.toLocaleString('tr-TR') : '—'}</dd>
              </div>
              <div className={soluk}>
                <dt>Hatalı üretim</dt>
                <dd>{latest ? latest.reject_count.toLocaleString('tr-TR') : '—'}</dd>
              </div>
              <div>
                <dt>Makine durumu</dt>
                <dd className={durumSinifi}>{durumMetni}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="bolum" aria-labelledby="oee-baslik">
          <h2 id="oee-baslik">
            OEE <span className="etiket">örnek değerler</span>
          </h2>
          <div className="oee-grid">
            <OeeGauge title="Availability" value={oee.availability} dark={karanlik} />
            <OeeGauge title="Performance" value={oee.performance} dark={karanlik} />
            <OeeGauge title="Quality" value={oee.quality} dark={karanlik} />
          </div>
          <p className="oee-toplam">
            OEE = A × P × Q = <strong>{formatPercent(oeeToplam)}</strong>
          </p>
          <p className="renk-aciklama">
            <span className="nokta kirmizi" /> %70 altı <span className="nokta sari" /> %70–85{' '}
            <span className="nokta yesil" /> %85 ve üstü
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
