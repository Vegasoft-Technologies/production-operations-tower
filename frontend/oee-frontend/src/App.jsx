import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import './App.css';

// Bileşen (component): ekrana çizilen bir React fonksiyonu
function App() {
  // State: değişince ekranın yeniden çizilmesini sağlayan veri
  const [deger, setDeger] = useState(50);

  // useEffect: bileşen ekrana ilk geldiğinde bir kez çalışır
  useEffect(() => {
    const zamanlayici = setInterval(() => {
      // 0-100 arası rastgele tam sayı
      setDeger(Math.floor(Math.random() * 101));
    }, 1000);

    // Temizlik: bileşen kapanınca zamanlayıcıyı durdur
    return () => clearInterval(zamanlayici);
  }, []);

  // ECharts "option" nesnesi: grafiğin tüm tanımı burada
  const option = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 100,
        progress: { show: true, width: 18 },
        axisLine: { lineStyle: { width: 18 } },
        pointer: { show: true },
        detail: {
          valueAnimation: true,
          formatter: '{value} %',
          fontSize: 32,
        },
        title: { offsetCenter: [0, '75%'], fontSize: 18 },
        data: [{ value: deger, name: 'OEE' }],
      },
    ],
  };

  return (
    <div className="kapsayici">
      <h1>OEE Gösterge Paneli</h1>
      <ReactECharts option={option} style={{ height: 400, width: 400 }} />
      <p>Değer her saniye rastgele güncelleniyor.</p>
    </div>
  );
}

export default App;
