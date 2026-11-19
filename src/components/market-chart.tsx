import { useEffect, useRef, useState } from 'react';
import { CandlestickChart, ChartLine, LocateFixed, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MarketTick } from '@/hooks/use-simulated-market';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

export type ChartPosition = { entry: number; entryEpoch: number; contract: string; left: number; total: number; won: boolean };

export function MarketChart({ ticks, decimals, symbol, position }: { ticks: MarketTick[]; decimals: number; symbol: string; position?: ChartPosition | null }) {
  const libRef = useRef<typeof import('lightweight-charts') | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Area' | 'Candlestick'> | null>(null);
  const [mode, setMode] = useState<'line' | 'candles'>('candles');
  const [interval, setInterval] = useState(300);
  const [ready, setReady] = useState(0);
  const [inspection, setInspection] = useState('');
  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    void import('lightweight-charts').then(lib => {
      if (!active || !host.current) return;
      libRef.current = lib;
      const css = getComputedStyle(host.current);
      // The chart library needs sRGB strings; convert semantic OKLCH tokens through canvas.
      const palette = document.createElement('canvas'); palette.width = 1; palette.height = 1;
      const context = palette.getContext('2d', { willReadFrequently: true });
      const token = (name: string) => {
        const value = css.getPropertyValue(name).trim();
        if (!context) return value;
        context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        return `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${(pixel[3] ?? 255) / 255})`;
      };
      const api = lib.createChart(host.current, {
        autoSize: true, height: 360,
        localization: { locale: 'en-US' },
        layout: { background: { type: lib.ColorType.Solid, color: token('--background') }, textColor: token('--muted-foreground'), fontFamily: css.fontFamily, fontSize: 11, attributionLogo: true },
        grid: { vertLines: { color: token('--secondary'), style: lib.LineStyle.Dotted }, horzLines: { color: token('--secondary'), style: lib.LineStyle.Dotted } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: .14, bottom: .14 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: mode === 'line', rightOffset: 8, barSpacing: mode === 'line' ? 4 : 9, minBarSpacing: 2 },
        crosshair: {
          mode: lib.CrosshairMode.Normal,
          vertLine: { color: token('--muted-foreground'), style: lib.LineStyle.Dashed, labelBackgroundColor: token('--primary') },
          horzLine: { color: token('--muted-foreground'), style: lib.LineStyle.Dashed, labelBackgroundColor: token('--primary') },
        },
      });
      const up = token('--success');
      const priceFormat = { type: 'price' as const, precision: decimals, minMove: 10 ** -decimals };
      series.current = mode === 'line'
        ? api.addSeries(lib.AreaSeries, {
            lineColor: up, lineWidth: 2, lineType: lib.LineType.Curved, priceFormat, lastValueVisible: true, priceLineVisible: true,
            priceLineColor: up, priceLineStyle: lib.LineStyle.Dashed,
            topColor: up.replace(/[\d.]+\)$/, '0.28)'), bottomColor: up.replace(/[\d.]+\)$/, '0)'),
            crosshairMarkerRadius: 4, crosshairMarkerBorderColor: up,
          })
        : api.addSeries(lib.CandlestickSeries, { upColor: up, downColor: token('--primary'), wickUpColor: up, wickDownColor: token('--primary'), borderVisible: false, priceFormat, priceLineColor: token('--muted-foreground'), priceLineStyle: lib.LineStyle.Dashed });
      chart.current = api;
      api.subscribeCrosshairMove(point => {
        const current = series.current;
        if (!current || !point.time) { setInspection(''); return; }
        const value = point.seriesData.get(current);
        if (value && 'value' in value) setInspection(`Price ${Number(value.value).toFixed(decimals)}`);
        else if (value && 'close' in value) setInspection(`O ${value.open.toFixed(decimals)}  H ${value.high.toFixed(decimals)}  L ${value.low.toFixed(decimals)}  C ${value.close.toFixed(decimals)}`);
      });
      observer = new ResizeObserver(() => { if (host.current) api.applyOptions({ width: host.current.clientWidth }); });
      observer.observe(host.current);
      setReady(value => value + 1);
    });
    return () => { active = false; observer?.disconnect(); chart.current?.remove(); chart.current = null; series.current = null; };
  }, [mode, decimals, symbol, interval]);
  const fitted = useRef('');
  useEffect(() => {
    const current = series.current;
    if (!current || !ticks.length) return;
    if (mode === 'line') current.setData(ticks.map(t => ({ time: t.epoch as Time, value: t.quote })));
    else {
      const candles = new Map<number, { time: Time; open: number; high: number; low: number; close: number }>();
      ticks.forEach(t => {
        const time = Math.floor(t.epoch / interval) * interval;
        const c = candles.get(time);
        if (c) { c.high = Math.max(c.high, t.quote); c.low = Math.min(c.low, t.quote); c.close = t.quote; }
        else candles.set(time, { time: time as Time, open: t.quote, high: t.quote, low: t.quote, close: t.quote });
      });
      current.setData([...candles.values()]);
    }
    const key = `${symbol}-${mode}-${interval}-${ready}`;
    if (fitted.current !== key) { const n = mode === 'line' ? ticks.length : Math.ceil((ticks.at(-1)!.epoch - ticks[0]!.epoch) / interval); const show = mode === 'line' ? 300 : 90; chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 6 }); fitted.current = key; }
  }, [ticks, mode, interval, ready, symbol]);
  // Open position overlay: entry line, entry/exit markers and a shaded run, like Deriv.
  const hadPosition = useRef(false);
  useEffect(() => {
    if (position && !hadPosition.current) setMode('line');
    hadPosition.current = !!position;
  }, [position]);
  useEffect(() => {
    const current = series.current; const lib = libRef.current;
    if (!current || !lib || !position || !host.current) return;
    const css = getComputedStyle(host.current);
    const done = position.left <= 0;
    const color = done ? (position.won ? css.getPropertyValue('--success') : css.getPropertyValue('--destructive')) : css.getPropertyValue('--primary');
    const toRgb = (v: string) => { const c = document.createElement('canvas').getContext('2d'); if (!c) return v; c.fillStyle = v.trim(); c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; };
    const col = toRgb(color);
    const line = current.createPriceLine({ price: position.entry, color: col, lineWidth: 2, lineStyle: lib.LineStyle.Dashed, axisLabelVisible: true, title: `${position.contract} entry` });
    const after = ticks.filter(t => t.epoch >= position.entryEpoch);
    const exit = done ? after[Math.min(after.length - 1, position.total)] : undefined;
    const markers: import("lightweight-charts").SeriesMarker<Time>[] = [{ time: position.entryEpoch as Time, position: 'inBar', color: col, shape: 'circle', text: 'Entry' }];
    if (exit) markers.push({ time: exit.epoch as Time, position: 'aboveBar', color: col, shape: 'arrowDown', text: position.won ? 'Won' : 'Lost' });
    const m = lib.createSeriesMarkers(current, markers);
    return () => { try { current.removePriceLine(line); m.detach(); } catch { /* series replaced */ } };
  }, [position, ticks, ready]);
  function zoom(factor: number) {
    const scale = chart.current?.timeScale(); const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const middle = (range.from + range.to) / 2; const half = (range.to - range.from) * factor / 2;
    scale.setVisibleLogicalRange({ from: middle - half, to: middle + half });
  }
  return <div className="market-chart-wrap"><div className="market-chart-toolbar"><div className="chart-mode-controls"><Button variant="ghost" size="icon" aria-label="Line chart" title="Line chart" aria-pressed={mode === 'line'} onClick={() => setMode('line')}><ChartLine /></Button><Button variant="ghost" size="icon" aria-label="Candlestick chart" title="Candlestick chart" aria-pressed={mode === 'candles'} onClick={() => setMode('candles')}><CandlestickChart /></Button>{mode === 'candles' && <select aria-label="Candle interval" value={interval} onChange={e => setInterval(Number(e.target.value))}><option value={60}>1m</option><option value={300}>5m</option><option value={900}>15m</option><option value={3600}>1h</option><option value={14400}>4h</option><option value={86400}>1D</option></select>}</div><div className="chart-mode-controls"><Button variant="ghost" size="icon" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(.7)}><Plus /></Button><Button variant="ghost" size="icon" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.4)}><Minus /></Button><Button variant="ghost" size="icon" aria-label="Fit chart" title="Fit chart" onClick={() => chart.current?.timeScale().fitContent()}><LocateFixed /></Button></div></div><div className="chart-inspection">{inspection || `${mode === 'line' ? 'Tick prices · 7-day history' : `${interval >= 86400 ? '1-day' : interval >= 3600 ? `${interval / 3600}-hour` : `${interval / 60}-minute`} candles`} · UTC`}</div>{position && <div className={`chart-position-badge ${position.left <= 0 ? (position.won ? 'won' : 'lost') : ''}`}><strong>{position.contract}</strong><span>Entry {position.entry.toFixed(decimals)}</span><span>{position.left > 0 ? `${position.left} tick${position.left === 1 ? '' : 's'} left` : position.won ? 'Won' : 'Lost'}</span></div>}<div ref={host} className="market-chart-canvas" aria-label={`${symbol} live price chart`} />{!ticks.length && <div className="chart-empty">Waiting for prices…</div>}</div>;
}