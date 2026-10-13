import ReactECharts from 'echarts-for-react';

// "Son 60 sn'de üretilen parça" göstergesi (0–60).
export default function RateGauge({ value, dark = false }) {
  const text = dark ? '#f3f4f6' : '#08060d';
  const muted = dark ? '#9ca3af' : '#6b6375';

  const option = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 60,
        splitNumber: 6,
        progress: { show: true, width: 18 },
        axisLine: { lineStyle: { width: 18, color: [[1, dark ? '#2e303a' : '#e5e4e7']] } },
        pointer: { show: true },
        axisLabel: { color: muted },
        detail: { valueAnimation: true, formatter: '{value}', fontSize: 32, color: text },
        title: { offsetCenter: [0, '75%'], fontSize: 15, color: muted },
        data: [{ value, name: 'parça / son 60 sn' }],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 300, width: '100%', maxWidth: 360, margin: '0 auto' }} />;
}
