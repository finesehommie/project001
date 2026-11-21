import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Bot, Radar, Sparkles } from 'lucide-react';
import { PRESETS, triggerMet, type Trigger } from '@/lib/bot-presets';
import { sounds } from '@/lib/sounds';
import { useSimulatedMarket, type MarketTick } from '@/hooks/use-simulated-market';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { useSession } from '@/components/session-context';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/page-head';

export const Route = createFileRoute('/_authenticated/bot')({
  head: () => pageHead('Trading Bot | Option Market Traders', 'Automate demo digit trades with Martingale, D’Alembert and fixed-stake strategies.'),
  component: BotPage,
});

const markets = [['R_10', 'Volatility 10'], ['R_25', 'Volatility 25'], ['R_50', 'Volatility 50'], ['R_75', 'Volatility 75'], ['R_100', 'Volatility 100']];
const contracts = [['RISE', 'Rise'], ['FALL', 'Fall'], ['EVEN', 'Even'], ['ODD', 'Odd'], ['OVER', 'Over'], ['UNDER', 'Under'], ['MATCHES', 'Matches'], ['DIFFERS', 'Differs']];
const FEEDS = [
  { id: 'R_10', decimals: 3, start: 6500, vol: 0.1 }, { id: 'R_25', decimals: 3, start: 2400, vol: 0.25 },
  { id: 'R_50', decimals: 4, start: 230, vol: 0.5 }, { id: 'R_75', decimals: 4, start: 51000, vol: 0.75 },
  { id: 'R_100', decimals: 2, start: 1300, vol: 1 },
] as const;
export type Signal = { market: string; contract: string; barrier: number; label: string; strength: number; sample: number };

// Scan the last 100 ticks: find the strongest digit bias (even/odd, high/low, rarest digit).
export function scanDigits(market: string, ticks: MarketTick[], decimals: number): Signal | null {
  const digits = ticks.slice(-100).map(t => Number(t.quote.toFixed(decimals).slice(-1)));
  if (digits.length < 20) return null;
  const n = digits.length;
  const even = digits.filter(d => d % 2 === 0).length / n;
  const high = digits.filter(d => d >= 5).length / n;
  const counts = Array.from({ length: 10 }, (_, d) => digits.filter(x => x === d).length);
  const rare = counts.indexOf(Math.min(...counts));
  const options: Signal[] = [
    { market, contract: even >= 0.5 ? 'EVEN' : 'ODD', barrier: 0, label: even >= 0.5 ? `Even ${Math.round(even * 100)}%` : `Odd ${Math.round((1 - even) * 100)}%`, strength: Math.abs(even - 0.5) * 2, sample: n },
    { market, contract: high >= 0.5 ? 'OVER' : 'UNDER', barrier: high >= 0.5 ? 4 : 5, label: high >= 0.5 ? `Over 4 · ${Math.round(high * 100)}%` : `Under 5 · ${Math.round((1 - high) * 100)}%`, strength: Math.abs(high - 0.5) * 2, sample: n },
    { market, contract: 'DIFFERS', barrier: rare, label: `Differs ${rare} · seen ${counts[rare] ?? 0}×`, strength: Math.max(0, 0.1 - (counts[rare] ?? 0) / n) * 5, sample: n },
  ];
  return options.sort((a, b) => b.strength - a.strength)[0] ?? null;
}

import type { Strategy } from '@/lib/bot-presets';
type Log = { n: number; won: boolean; stake: number; profit: number; digit: number; label: string };

export function nextStake(strategy: Strategy, base: number, current: number, won: boolean, multiplier: number) {
  if (strategy === 'martingale') return won ? base : Math.round(current * multiplier * 100) / 100;
  if (strategy === 'reverse') return won ? Math.round(current * multiplier * 100) / 100 : base;
  if (strategy === 'oscar') return won ? Math.round((current + base) * 100) / 100 : current;
  if (strategy === '1326') { const seq = [1, 3, 2, 6]; if (!won) return base; const i = seq.findIndex(x => Math.abs(x * base - current) < 0.001); return Math.round(base * (seq[(i + 1) % 4] ?? 1) * 100) / 100; }
  if (strategy === 'dalembert') return won ? Math.max(base, Math.round((current - base) * 100) / 100) : Math.round((current + base) * 100) / 100;
  return base;
}

function BotPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const balance = useQuery({ queryKey: ['practice-balance', user?.id], queryFn: async () => { const { data, error } = await supabase.rpc('get_practice_account'); if (error) throw error; return Number(data); } });
  const [market, setMarket] = useState('R_100');
  const [contract, setContract] = useState('EVEN');
  const [barrier, setBarrier] = useState(5);
  const [strategy, setStrategy] = useState<Strategy>('martingale');
  const [base, setBase] = useState('1');
  const [multiplier, setMultiplier] = useState('2');
  const [takeProfit, setTakeProfit] = useState('20');
  const [stopLoss, setStopLoss] = useState('50');
  const [maxRuns, setMaxRuns] = useState('50');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [autoScan, setAutoScan] = useState(true);
  const [trigger, setTrigger] = useState<Trigger>({ kind: 'none', count: 3 });
  const [preset, setPreset] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [tab, setTab] = useState<'scan' | 'setup' | 'results'>('setup');
  function applyPreset(id: string) { const pr = PRESETS.find(x => x.id === id); setPreset(id); if (!pr) return; setStrategy(pr.strategy); setContract(pr.contract); setBarrier(pr.barrier); setBase(pr.base); setMultiplier(pr.multiplier); setTakeProfit(pr.takeProfit); setStopLoss(pr.stopLoss); setMaxRuns(pr.maxRuns); setAutoScan(pr.autoScan); setTrigger(pr.trigger); toast.success(`Loaded ${pr.name}`); }
  const feeds = [useSimulatedMarket(FEEDS[0].id, FEEDS[0].decimals, FEEDS[0].start, FEEDS[0].vol), useSimulatedMarket(FEEDS[1].id, FEEDS[1].decimals, FEEDS[1].start, FEEDS[1].vol), useSimulatedMarket(FEEDS[2].id, FEEDS[2].decimals, FEEDS[2].start, FEEDS[2].vol), useSimulatedMarket(FEEDS[3].id, FEEDS[3].decimals, FEEDS[3].start, FEEDS[3].vol), useSimulatedMarket(FEEDS[4].id, FEEDS[4].decimals, FEEDS[4].start, FEEDS[4].vol)];
  const signals = FEEDS.map((f, i) => scanDigits(f.id, feeds[i]?.ticks ?? [], f.decimals));
  const best = signals.filter((x): x is Signal => !!x).sort((a, b) => b.strength - a.strength)[0];
  const bestRef = useRef<Signal | undefined>(best);
  bestRef.current = best;
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
  const digitsFor = (m: string) => { const i = FEEDS.findIndex(f => f.id === m); const f = FEEDS[i]; return (feedsRef.current[i]?.ticks ?? []).slice(-20).map(t => Number(t.quote.toFixed(f?.decimals ?? 2).slice(-1))); };
  function useSignal(sig: Signal) { setMarket(sig.market); setContract(sig.contract); setBarrier(sig.barrier); }
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);

  const total = logs.reduce((s, l) => s + l.profit, 0);
  const wins = logs.filter(l => l.won).length;

  async function start() {
    const b = Number(base), mult = Number(multiplier), tp = Number(takeProfit), sl = Number(stopLoss), runs = Math.min(500, Number(maxRuns));
    if (!(b >= 0.35 && b <= 5000)) { toast.error('Initial stake must be between 0.35 and 5,000'); return; }
    stop.current = false; setRunning(true); setLogs([]); setTab('results');
    let stake = b, pnl = 0;
    let guard = 0;
    for (let n = 1; n <= runs && !stop.current; n++) {
      // Wait for the entry condition (streak trigger) before each trade.
      while (!stop.current && !triggerMet(digitsFor(autoScan && bestRef.current ? bestRef.current.market : market), trigger) && guard++ < 600) { setWaiting(true); await new Promise(res => setTimeout(res, 1000)); }
      setWaiting(false);
      if (stop.current) break;
      if (stake > 5000) { toast.error('Stake limit reached — bot stopped'); break; }
      const sig = autoScan ? bestRef.current : undefined;
      const m = sig?.market ?? market, c = sig?.contract ?? contract, bar = sig ? sig.barrier : barrier;
      if (sig) useSignal(sig);
      const { data, error } = await supabase.rpc('place_bot_trade', { _market: m, _contract: c, _barrier: ['EVEN', 'ODD', 'RISE', 'FALL'].includes(c) ? 0 : bar, _stake: stake });
      if (error) { toast.error(error.message); break; }
      const r = data as { exit_digit: number; won: boolean; profit: number; balance: number };
      pnl += Number(r.profit);
      if (r.won) sounds.win(); else sounds.loss();
      setLogs(prev => [{ n, won: r.won, stake, profit: Number(r.profit), digit: r.exit_digit, label: `${m.replace('R_', 'V')} ${c}${['EVEN', 'ODD', 'RISE', 'FALL'].includes(c) ? '' : ` ${bar}`}` }, ...prev]);
      qc.setQueryData(['practice-balance', user?.id], Number(r.balance));
      if (pnl >= tp) { toast.success('Take profit reached'); break; }
      if (-pnl >= sl) { toast.error('Stop loss reached'); break; }
      stake = nextStake(strategy, b, stake, r.won, mult);
      await new Promise(res => setTimeout(res, 1200));
    }
    setRunning(false); setWaiting(false);
    void qc.invalidateQueries({ queryKey: ['practice-trades', user?.id] });
  }

  const needsDigit = !['EVEN', 'ODD', 'RISE', 'FALL'].includes(contract);
  return <div className="bot-shell"><SiteHeader /><main className="bot-page">
    <div className="bot-head"><h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 700 }}><Bot /> Trading Bot</h1><p className="section-description">Demo · <strong>{balance.data?.toFixed(2) ?? '…'} USD</strong>{logs.length ? <> · P/L <strong className={total >= 0 ? 'bot-win' : 'bot-loss'}>{total.toFixed(2)}</strong></> : null}</p>{running ? <Button variant="outline" onClick={() => { stop.current = true; }}><Square /> Stop bot</Button> : <Button onClick={start}><Play /> Run bot</Button>}</div>
    <section className="bot-library" aria-label="Choose a bot"><div className="bot-library-head"><h2>Choose a bot</h2><span>{PRESETS.length} bots · tap to load, then Run</span></div><div className="bot-library-row">{PRESETS.map(p => <button type="button" key={p.id} disabled={running} aria-pressed={preset === p.id} className={`bot-tile ${preset === p.id ? 'active' : ''}`} onClick={() => applyPreset(p.id)}><span className="bot-tile-top"><Bot size={16} /><em className={`risk risk-${p.risk.toLowerCase()}`}>{p.risk}</em></span><strong>{p.name}</strong><small>{p.description}</small></button>)}</div></section>
    <div className="bot-live-strip" aria-label="Last digits">{digitsFor(autoScan && best ? best.market : market).slice(-14).map((d, i, a) => <span key={i} className={`${i === a.length - 1 ? 'now' : ''} ${i > 0 && a[i - 1] === d ? 'rep' : ''}`}>{d}</span>)}<small>{(autoScan && best ? best.market : market).replace('R_', 'Volatility ')} · last digits{running ? ' · bot running' : ''}</small></div>
    <div className="bot-tabs" role="tablist" aria-label="Bot sections">{([['scan', 'Scanner'], ['setup', 'Settings'], ['results', `Results${logs.length ? ` · ${logs.length}` : ''}`]] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div className="bot-grid">
      <section className={`bot-card ${tab === 'scan' ? 'tab-on' : ''}`}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}><Radar /> Market scanner <small className="section-description" style={{ fontSize: 11 }}>· live</small></h2>
        <table className="scanner-table"><thead><tr><th>Market</th><th>Signal</th><th>Strength</th><th /></tr></thead><tbody>
          {FEEDS.map((f, i) => { const sig = signals[i]; return <tr key={f.id} className={sig && best && sig.market === best.market ? 'best' : ''}><td>{markets.find(m => m[0] === f.id)?.[1]}</td><td>{sig?.label ?? 'Scanning…'}</td><td>{sig ? <>{Math.round(sig.strength * 100)}<span className="scanner-bar"><i style={{ width: `${Math.min(100, sig.strength * 300)}%` }} /></span></> : '—'}</td><td>{sig && <Button size="sm" variant="ghost" disabled={running} onClick={() => useSignal(sig)}>Use</Button>}</td></tr>; })}
        </tbody></table>
        <p className="section-description" style={{ fontSize: 11 }}>Signals describe recent demo digits only; they don’t predict future results.</p>
      </section>
      <section className={`bot-card ${tab === 'setup' ? 'tab-on' : ''}`}>
        <label><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> Strategy preset</span><select value={preset} disabled={running} onChange={e => applyPreset(e.target.value)}><option value="">Custom</option>{PRESETS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.description}</option>)}</select></label>
        <label>Strategy<select value={strategy} disabled={running} onChange={e => setStrategy(e.target.value as Strategy)}><option value="martingale">Martingale</option><option value="dalembert">D’Alembert</option><option value="oscar">Oscar’s Grind</option><option value="reverse">Reverse Martingale</option><option value="1326">1-3-2-6</option><option value="fixed">Fixed stake</option></select></label>
        <div className="bot-fields">
          <label>Market<select value={market} disabled={running} onChange={e => setMarket(e.target.value)}>{markets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Contract<select value={contract} disabled={running} onChange={e => setContract(e.target.value)}>{contracts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {needsDigit && <label>Digit<select value={barrier} disabled={running} onChange={e => setBarrier(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label>}
          <label>Initial stake<input type="number" step="0.01" value={base} disabled={running} onChange={e => setBase(e.target.value)} /></label>
          {strategy === 'martingale' && <label>Multiplier<input type="number" step="0.1" value={multiplier} disabled={running} onChange={e => setMultiplier(e.target.value)} /></label>}
          <label>Take profit<input type="number" value={takeProfit} disabled={running} onChange={e => setTakeProfit(e.target.value)} /></label>
          <label>Stop loss<input type="number" value={stopLoss} disabled={running} onChange={e => setStopLoss(e.target.value)} /></label>
          <label>Entry trigger<select value={trigger.kind} disabled={running} onChange={e => setTrigger({ ...trigger, kind: e.target.value as Trigger['kind'] })}><option value="none">Trade immediately</option><option value="even">After Even streak</option><option value="odd">After Odd streak</option><option value="high">After high (5–9) streak</option><option value="low">After low (0–4) streak</option><option value="repeat">After a digit repeats</option></select></label>
          {trigger.kind !== 'none' && <label>Streak length<input type="number" min={1} max={10} value={trigger.count} disabled={running} onChange={e => setTrigger({ ...trigger, count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} /></label>}
          <label>Max trades<input type="number" value={maxRuns} disabled={running} onChange={e => setMaxRuns(e.target.value)} /></label>
        </div>
        <label className="bot-check"><input type="checkbox" checked={autoScan} disabled={running} onChange={e => setAutoScan(e.target.checked)} /> Auto-scan: trade the strongest signal each round</label>
      </section>
      <section className={`bot-card ${tab === 'results' ? 'tab-on' : ''}`}>
        <div className="bot-stats"><div><small>Trades</small><strong>{logs.length}</strong></div><div><small>Won</small><strong>{wins}</strong></div><div><small>Win rate</small><strong>{logs.length ? Math.round(wins / logs.length * 100) : 0}%</strong></div><div><small>Profit</small><strong className={total >= 0 ? 'bot-win' : 'bot-loss'}>{total.toFixed(2)}</strong></div></div>
        <EquityCurve values={logs.slice().reverse().reduce<number[]>((a, l) => [...a, (a[a.length - 1] ?? 0) + l.profit], [0])} />
        {waiting && <p className="bot-waiting" role="status">Waiting for entry trigger…</p>}
        <div className="bot-log">{logs.length ? logs.map(l => <div key={l.n}><span>#{l.n} · {l.label} · stake {l.stake.toFixed(2)} · digit {l.digit}</span><span className={l.won ? 'bot-win' : 'bot-loss'}>{l.won ? 'Won' : 'Lost'} {l.profit.toFixed(2)}</span></div>) : <p className="section-description">Set your strategy and press Run bot. Each trade is shown here.</p>}</div>
      </section>
    </div>
  </main></div>;
}


function EquityCurve({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="equity-curve empty">Profit curve appears after the first trade</div>;
  const w = 300, h = 70, min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
  const zero = h - ((0 - min) / span) * h;
  const up = (values[values.length - 1] ?? 0) >= 0;
  return <svg className={`equity-curve ${up ? 'up' : 'down'}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Session profit curve">
    <line x1="0" x2={w} y1={zero} y2={zero} className="equity-zero" />
    <polyline points={`0,${zero} ${pts} ${w},${zero}`} className="equity-fill" />
    <polyline points={pts} className="equity-line" />
  </svg>;
}
