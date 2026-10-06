import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useMachineStream } from './hooks/useMachineStream';
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

  // Gauge içindeki yazı renkleri temaya göre
  const yaziRengi = karanlik ? '#f3f4f6' : '#08060d';
  const ikinciRenk = karanlik ? '#9ca3af' : '#6b6375';

  // ECharts "option" nesnesi: son 60 sn'de üretilen parça (0–60)
  const option = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 60,
        splitNumber: 6,
        progress: { show: true, width: 18 },
        axisLine: {
          lineStyle: { width: 18, color: [[1, karanlik ? '#2e303a' : '#e5e4e7']] },
        },
        pointer: { show: true },
        axisLabel: { color: ikinciRenk },
        detail: {
          valueAnimation: true,
          formatter: '{value}',
          fontSize: 32,
          color: yaziRengi,
        },
        title: { offsetCenter: [0, '75%'], fontSize: 16, color: ikinciRenk },
        data: [{ value: perMinute, name: 'parça / son 60 sn' }],
      },
    ],
  };

  // 10 sn'dir veri yoksa son değerler artık güncel değil: soluk göster, durum "Veri yok"
  const veriYok = stale || !latest;
  const calisiyor = latest?.status === true;

  let durumMetni = 'Veri yok';
  let durumSinifi = 'durum-veri-yok';
  if (!veriYok) {
    durumMetni = calisiyor ? 'Çalışıyor' : 'Duruşta';
    durumSinifi = calisiyor ? 'durum-calisiyor' : 'durum-durusta';
  }

  return (
    <div className="kapsayici">
      <button
        className="tema-butonu"
        onClick={() => setKaranlik(!karanlik)}
        aria-label={karanlik ? 'Açık moda geç' : 'Karanlık moda geç'}
        title={karanlik ? 'Açık moda geç' : 'Karanlık moda geç'}
      >
        {karanlik ? <GunesSimgesi /> : <AySimgesi />}
      </button>

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

      <div className={veriYok ? 'canli soluk' : 'canli'}>
        <ReactECharts option={option} style={{ height: 360, width: '100%', maxWidth: 400, margin: '0 auto' }} />

        <dl className="bilgiler">
          <div>
            <dt>Toplam üretim</dt>
            <dd>{latest ? latest.total_count.toLocaleString('tr-TR') : '—'}</dd>
          </div>
          <div>
            <dt>Hatalı üretim</dt>
            <dd>{latest ? latest.reject_count.toLocaleString('tr-TR') : '—'}</dd>
          </div>
          <div>
            <dt>Makine durumu</dt>
            <dd className={durumSinifi}>{durumMetni}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default App;
