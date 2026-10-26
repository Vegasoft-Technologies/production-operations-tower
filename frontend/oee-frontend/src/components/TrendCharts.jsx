import { memo, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { findGaps, ratioToPct } from '../lib/trend';
import { formatPercent } from '../lib/gauge';

// Kategorik palet (dataviz referans paleti, 1–4. sıra; açık/koyu tema ayrı adımlar).
// Renk serinin kimliğini taşır; sıra sabit, her grafikte aynı. Renk tek başına
// kimlik taşımasın diye lejant, araç ipucu ve "Tablo olarak göster" görünümü var.
const SERIES_COLORS = {
  light: { oee: '#2a78d6', availability: '#eb6834', performance: '#1baf7a', quality: '#eda100' },
  dark: { oee: '#3987e5', availability: '#d95926', performance: '#199e70', quality: '#c98500' },
};

const SERIES = [
  { key: 'oee', name: 'OEE', width: 3 },
  { key: 'availability', name: 'Availability', width: 2 },
  { key: 'performance', name: 'Performance', width: 2 },
  { key: 'quality', name: 'Quality', width: 2 },
];

function theme(dark) {
  return {
    text: dark ? '#f3f4f6' : '#08060d',
    muted: dark ? '#9ca3af' : '#6b6375',
    grid: dark ? '#2e303a' : '#e5e4e7',
    gapFill: dark ? 'rgba(156,163,175,0.12)' : 'rgba(107,99,117,0.08)',
    tooltipBg: dark ? '#1f2028' : '#ffffff',
    zoomFill: dark ? 'rgba(57,135,229,0.18)' : 'rgba(42,120,214,0.12)',
    handle: dark ? '#9ca3af' : '#6b6375',
  };
}

const timeLabel = (ms) =>
  new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// "Veri yok" bandı: kopukluğu gri bir alanla gösterir, çizgi orada kesilir
function gapArea(rows, key, t) {
  const gaps = findGaps(rows, key);
  if (gaps.length === 0) return undefined;
  return {
    silent: true,
    itemStyle: { color: t.gapFill },
    label: { show: true, position: 'insideTop', color: t.muted, fontSize: 11, formatter: 'veri yok' },
    data: gaps.map(([from, to]) => [{ xAxis: from }, { xAxis: to }]),
  };
}

// İki grafik aynı grupta: birinde yakınlaştırma/kaydırma diğerine de uygulanır
const TREND_GROUP = 'oee-trend';
const MIN_SPAN_MS = 15 * 60 * 1000; // en fazla 15 dakikaya kadar yakınlaşılır

// Bağlı grafiklerde dataZoom bileşenleri aynı sırada olmalı: 0 = içeride, 1 = kaydırma çubuğu.
// Çubuk yalnızca alttaki grafikte görünür.
function dataZoom(t, showSlider) {
  return [
    {
      type: 'inside',
      xAxisIndex: 0,
      filterMode: 'none', // kenardaki çizgi parçaları kesilmesin
      minValueSpan: MIN_SPAN_MS,
      zoomOnMouseWheel: 'ctrl', // sayfa kaydırması bozulmasın: yakınlaştırma Ctrl + tekerlek
      moveOnMouseWheel: false,
      moveOnMouseMove: true, // sürükleyerek kaydır
    },
    {
      type: 'slider',
      show: showSlider,
      xAxisIndex: 0,
      filterMode: 'none',
      minValueSpan: MIN_SPAN_MS,
      height: 22,
      bottom: 6,
      left: 56, // tutamaç etiketleri ("09:46") kenardan taşmasın
      right: 56,
      borderColor: t.grid,
      fillerColor: t.zoomFill,
      handleStyle: { color: t.handle, borderColor: t.handle },
      moveHandleStyle: { color: t.handle },
      dataBackground: { lineStyle: { color: t.muted, opacity: 0.4 }, areaStyle: { color: t.muted, opacity: 0.1 } },
      textStyle: { color: t.muted, fontSize: 11 },
      labelFormatter: (v) => timeLabel(v),
      brushSelect: false,
    },
  ];
}

function joinGroup(chart) {
  chart.group = TREND_GROUP;
  echarts.connect(TREND_GROUP);
}

function baseAxes(t) {
  return {
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: t.grid } },
      axisTick: { show: false },
      axisLabel: { color: t.muted, formatter: (v) => timeLabel(v), hideOverlap: true },
      splitLine: { show: false },
    },
    tooltipBase: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.muted, type: 'dashed' } },
      backgroundColor: t.tooltipBg,
      borderColor: t.grid,
      textStyle: { color: t.text, fontSize: 13 },
    },
  };
}

// Ekran her saniye yenilenir (canlı veri). Ayarlar yalnızca veri ya da tema değişince
// yeniden hesaplanır; yoksa ECharts'a her saniye yeni ayar gider ve yakınlaştırma sıfırlanır.
function ratesOption(rows, dark) {
  const t = theme(dark);
  const colors = SERIES_COLORS[dark ? 'dark' : 'light'];
  const { xAxis, tooltipBase } = baseAxes(t);

  return {
    animation: false,
    grid: { left: 48, right: 24, top: 44, bottom: 28 },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 4,
      textStyle: { color: t.text, fontSize: 13 },
    },
    tooltip: {
      ...tooltipBase,
      formatter: (items) => {
        const head = `<div style="margin-bottom:4px;color:${t.muted}">${timeLabel(items[0].value[0])}</div>`;
        const lines = items.map((it) => {
          const v = it.value[1];
          const text = v === null ? 'veri yok' : formatPercent(v / 100);
          return `<div>${it.marker}${it.seriesName}: <b>${text}</b></div>`;
        });
        return head + lines.join('');
      },
    },
    xAxis,
    dataZoom: dataZoom(t, false),
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: 25,
      axisLabel: { color: t.muted, formatter: (v) => `%${v}` },
      splitLine: { lineStyle: { color: t.grid } },
    },
    series: SERIES.map((s, i) => ({
      type: 'line',
      name: s.name,
      data: rows.map((r) => [r.ts, ratioToPct(r[s.key])]),
      connectNulls: false, // veri yoksa çizgi kopar, tahmin edilmez
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: s.width, color: colors[s.key] },
      itemStyle: { color: colors[s.key] },
      emphasis: { focus: 'series' },
      // Hedef çizgisi ve "veri yok" bandı yalnızca ilk seride (bir kez çizilsin)
      ...(i === 0
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: t.muted, type: 'dashed', width: 1 },
              label: { color: t.muted, fontSize: 11, formatter: 'iyi seviye %85', position: 'insideStartTop' },
              data: [{ yAxis: 85 }],
            },
            markArea: gapArea(rows, s.key, t),
          }
        : {}),
    })),
  };

}

function RatesTrend({ rows, dark = false, chartRef }) {
  const option = useMemo(() => ratesOption(rows, dark), [rows, dark]);
  return (
    <ReactECharts ref={chartRef} option={option} notMerge onChartReady={joinGroup} style={{ height: 300, width: '100%' }} />
  );
}

function productionOption(rows, dark, stepMinutes) {
  const t = theme(dark);
  const color = SERIES_COLORS[dark ? 'dark' : 'light'].oee;
  const { xAxis, tooltipBase } = baseAxes(t);

  return {
    animation: false,
    grid: { left: 48, right: 24, top: 16, bottom: 64 }, // altta kaydırma çubuğuna yer
    tooltip: {
      ...tooltipBase,
      formatter: (items) => {
        const it = items[0];
        const v = it.value[1];
        const text = v === null ? 'veri yok' : `${v.toLocaleString('tr-TR')} parça`;
        return `<div style="margin-bottom:4px;color:${t.muted}">${timeLabel(it.value[0])}</div><div>${it.marker}Üretim: <b>${text}</b></div>`;
      },
    },
    xAxis,
    dataZoom: dataZoom(t, true),
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { color: t.muted },
      splitLine: { lineStyle: { color: t.grid } },
    },
    series: [
      {
        type: 'line',
        name: `Üretim (parça / ${stepMinutes} dk)`,
        data: rows.map((r) => [r.ts, r.parts]),
        connectNulls: false,
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.18 },
        markArea: gapArea(rows, 'parts', t),
      },
    ],
  };

}

function ProductionTrend({ rows, dark = false, stepMinutes = 5, chartRef }) {
  const option = useMemo(() => productionOption(rows, dark, stepMinutes), [rows, dark, stepMinutes]);
  return (
    <ReactECharts ref={chartRef} option={option} notMerge onChartReady={joinGroup} style={{ height: 260, width: '100%' }} />
  );
}

// İki grafik + yakınlaştırma ipucu ve sıfırlama butonu.
// memo: üst bileşen her saniye yenilense de props değişmedikçe panel yeniden çizilmez.
export const TrendPanel = memo(function TrendPanel({ rows, dark = false, stepMinutes = 5 }) {
  const ratesRef = useRef(null);
  const partsRef = useRef(null);

  const reset = () => {
    // Grafikler bağlı olduğu için birine göndermek yeter; yine de ikisine de gönderiyoruz
    for (const ref of [ratesRef, partsRef]) {
      ref.current?.getEchartsInstance().dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    }
  };

  return (
    <div className="trend">
      <div className="trend-ust">
        <p className="trend-ipucu">
          Sürükleyerek kaydır · Ctrl + tekerlek ile yakınlaştır · alttaki çubukla aralık seç
        </p>
        <button type="button" className="kucuk-buton" onClick={reset}>
          Tümünü göster
        </button>
      </div>
      <h3 className="grafik-baslik">OEE, Availability, Performance ve Quality ({stepMinutes} dk aralıklarla)</h3>
      <RatesTrend rows={rows} dark={dark} chartRef={ratesRef} />
      <h3 className="grafik-baslik">Üretim adedi (parça / {stepMinutes} dk)</h3>
      <ProductionTrend rows={rows} dark={dark} stepMinutes={stepMinutes} chartRef={partsRef} />
    </div>
  );
});
