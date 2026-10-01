import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import './App.css';

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

// Bileşen (component): ekrana çizilen bir React fonksiyonu
function App() {
  // State: değişince ekranın yeniden çizilmesini sağlayan veri
  const [deger, setDeger] = useState(50);
  // Sayfa her zaman açık temayla başlar
  const [karanlik, setKaranlik] = useState(false);

  // useEffect: bileşen ekrana ilk geldiğinde bir kez çalışır
  useEffect(() => {
    const zamanlayici = setInterval(() => {
      // 0-100 arası rastgele tam sayı
      setDeger(Math.floor(Math.random() * 101));
    }, 1000);

    // Temizlik: bileşen kapanınca zamanlayıcıyı durdur
    return () => clearInterval(zamanlayici);
  }, []);

  // Tema değişince <html> etiketine data-theme yaz, CSS renkleri buna göre değişir
  useEffect(() => {
    document.documentElement.dataset.theme = karanlik ? 'dark' : 'light';
  }, [karanlik]);

  // Gauge içindeki yazı renkleri temaya göre
  const yaziRengi = karanlik ? '#f3f4f6' : '#08060d';
  const ikinciRenk = karanlik ? '#9ca3af' : '#6b6375';

  // ECharts "option" nesnesi: grafiğin tüm tanımı burada
  const option = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 100,
        progress: { show: true, width: 18 },
        axisLine: {
          lineStyle: {
            width: 18,
            color: [[1, karanlik ? '#2e303a' : '#e5e4e7']],
          },
        },
        pointer: { show: true },
        axisLabel: { color: ikinciRenk },
        detail: {
          valueAnimation: true,
          formatter: '{value} %',
          fontSize: 32,
          color: yaziRengi,
        },
        title: { offsetCenter: [0, '75%'], fontSize: 18, color: ikinciRenk },
        data: [{ value: deger, name: 'OEE' }],
      },
    ],
  };

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
      <ReactECharts option={option} style={{ height: 400, width: 400 }} />
      <p>Değer her saniye rastgele güncelleniyor.</p>
    </div>
  );
}

export default App;
