import { useEffect, useState } from 'react';

export type MarketTick = { epoch: number; quote: number };
type FeedState = { symbol: string; ticks: MarketTick[]; decimals: number; status: 'connecting' | 'live' | 'offline'; error: string; updated: number | null };

// Sometimes repeat the previous last digit, like real synthetic indices do.
function withRepeats(next: number, prev: number, precision: number, step: number) {
  if (Math.random() > 0.14) return Number(next.toFixed(precision));
  const unit = 10 ** -precision;
  const prevDigit = Math.round(prev / unit) % 10;
  const units = Math.round(next / unit);
  const adjusted = (units - (units % 10) + prevDigit) * unit;
  return Number(Math.max(step, adjusted).toFixed(precision));
}

// In-house simulated price feed: a fair random walk generated locally, one tick per second.
export function useSimulatedMarket(symbol: string, precision: number, start: number, volatility: number) {
  const [state, setState] = useState<FeedState>({ symbol, ticks: [], decimals: precision, status: 'connecting', error: '', updated: null });
  useEffect(() => {
    const step = start * volatility * 0.002;
    const now = Math.floor(Date.now() / 1000);
    let price = start;
    const history: MarketTick[] = [];
    // One week of minute-level history, then the last 10 minutes at one tick per second.
    const week = 7 * 24 * 60;
    let p0 = start;
    const minutes: number[] = [];
    for (let i = 0; i < week; i++) { p0 = Math.max(step, p0 + (Math.random() - 0.5) * 2 * step * 6); minutes.push(p0); }
    const offset = start - p0;
    minutes.forEach((q, i) => history.push({ epoch: now - 600 - (week - i) * 60, quote: Number(Math.max(step, q + offset).toFixed(precision)) }));
    for (let i = 600; i > 0; i--) {
      price = withRepeats(Math.max(step, price + (Math.random() - 0.5) * 2 * step), price, precision, step);
      history.push({ epoch: now - i, quote: price });
    }
    setState({ symbol, ticks: history, decimals: precision, status: 'live', error: '', updated: history.at(-1)?.epoch ?? null });
    const id = setInterval(() => {
      price = withRepeats(Math.max(step, price + (Math.random() - 0.5) * 2 * step), price, precision, step);
      const tick: MarketTick = { epoch: Math.floor(Date.now() / 1000), quote: price };
      setState(prev => ({ symbol, ticks: [...prev.ticks.filter(t => t.epoch < tick.epoch), tick].slice(-14000), decimals: precision, status: 'live', error: '', updated: tick.epoch }));
    }, 1000);
    return () => clearInterval(id);
  }, [symbol, precision, start, volatility]);
  const current = state.symbol === symbol ? state : { symbol, ticks: [], decimals: precision, status: 'connecting' as const, error: '', updated: null };
  return { ...current, reconnect: () => undefined };
}
