import ReactECharts from 'echarts-for-react';
import { GAUGE_COLORS, GREEN_FROM, YELLOW_FROM, formatPercent, gaugeColor, toPercent } from '../lib/gauge';

// Availability / Performance / Quality için tek gösterge bileşeni.
// value: 0–1 arası oran (backend de böyle gönderecek); yüzdeye kendisi çevirir.
export default function OeeGauge({ title, value, dark = false }) {
  const hasValue = value != null && Number.isFinite(value);
  const color = hasValue ? gaugeColor(value) : '#9ca3af';
  const text = dark ? '#f3f4f6' : '#08060d';
  const muted = dark ? '#9ca3af' : '#6b6375';

  const option = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 100,
        splitNumber: 20, // 5'er adım: 70 ve 85 de işaret çizgisine denk gelir
        radius: '92%',
        // Arka plandaki renk aralıkları (eşikleri gösterir)
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [YELLOW_FROM / 100, `${GAUGE_COLORS.red}33`],
              [GREEN_FROM / 100, `${GAUGE_COLORS.yellow}40`],
              [1, `${GAUGE_COLORS.green}33`],
            ],
          },
        },
        // Değerin kendisi: rengi bizim fonksiyonumuz seçer ('auto' değil)
        progress: { show: true, width: 14, itemStyle: { color } },
        // İbre yok: renkli yay değeri gösterir, ibre %100'de yazının üstüne biniyordu
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { distance: 2, length: 6, lineStyle: { color: muted, width: 1 } },
        axisLabel: {
          distance: 18,
          fontSize: 11,
          color: muted,
          // Yalnızca eşikler yazılır (70 ve 85)
          formatter: (v) => ([YELLOW_FROM, GREEN_FROM].includes(Math.round(v)) ? `${Math.round(v)}` : ''),
        },
        title: { offsetCenter: [0, '62%'], fontSize: 14, color: muted },
        detail: {
          offsetCenter: [0, '8%'],
          fontSize: 26,
          fontWeight: 600,
          color: text,
          formatter: () => formatPercent(hasValue ? value : null),
        },
        data: [{ value: hasValue ? toPercent(value) : 0, name: title }],
      },
    ],
  };

  return (
    <figure className="oee-gauge" aria-label={`${title}: ${formatPercent(hasValue ? value : null)}`}>
      <ReactECharts option={option} style={{ height: 220, width: '100%' }} />
    </figure>
  );
}
