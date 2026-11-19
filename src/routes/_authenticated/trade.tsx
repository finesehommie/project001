import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, History, RotateCcw, Play, Square, Bot as BotIcon, SlidersHorizontal, TrendingUp, TrendingDown, Volume2, VolumeX } from 'lucide-react';
import { sounds, soundEnabled, setSoundEnabled } from '@/lib/sounds';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/session-context';
import { pageHead } from '@/lib/page-head';
import { useSimulatedMarket } from '@/hooks/use-simulated-market';
import { MarketChart } from '@/components/market-chart';

export const Route = createFileRoute('/_authenticated/trade')({
  head: () => pageHead('Digit Trading | SOSDERIV', 'Practise Over/Under, Matches/Differs and Even/Odd digit contracts on simulated volatility markets with easy ~90% win-rate demo settlement.'),
  component: TradePage,
});

const MARKETS = [
  { id: 'R_10', name: 'Volatility 10 Index', vol: 0.1, decimals: 3, start: 6500 },
  { id: 'R_25', name: 'Volatility 25 Index', vol: 0.25, decimals: 3, start: 2400 },
  { id: 'R_50', name: 'Volatility 50 Index', vol: 0.5, decimals: 4, start: 230 },
  { id: 'R_75', name: 'Volatility 75 Index', vol: 0.75, decimals: 4, start: 51000 },
  { id: 'R_100', name: 'Volatility 100 Index', vol: 1, decimals: 2, start: 1300 },
] as const;
type Market = (typeof MARKETS)[number];
type Group = 'RISE_FALL' | 'OVER_UNDER' | 'MATCHES_DIFFERS' | 'EVEN_ODD';
const NO_DIGIT = (g: string) => g === 'EVEN_ODD' || g === 'RISE_FALL';
const STAKE_CHIPS = [1, 5, 10, 50, 100];
const GROUPS: { id: Group; label: string; sides: [string, string]; labels: [string, string] }[] = [
  { id: 'RISE_FALL', label: 'Rise / Fall', sides: ['RISE', 'FALL'], labels: ['Rise', 'Fall'] },
  { id: 'OVER_UNDER', label: 'Over / Under', sides: ['OVER', 'UNDER'], labels: ['Over', 'Under'] },
  { id: 'MATCHES_DIFFERS', label: 'Matches / Differs', sides: ['MATCHES', 'DIFFERS'], labels: ['Matches', 'Differs'] },
  { id: 'EVEN_ODD', label: 'Even / Odd', sides: ['EVEN', 'ODD'], labels: ['Even', 'Odd'] },
];
const lastDigit = (p: number, dec: number) => Number(p.toFixed(dec).slice(-1));
function probability(c: string, b: number) {
  return c === 'EVEN' || c === 'ODD' || c === 'RISE' || c === 'FALL' ? 0.5 : c === 'MATCHES' ? 0.1 : c === 'DIFFERS' ? 0.9 : c === 'OVER' ? (9 - b) / 10 : b / 10;
}
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


function TradePage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [market, setMarket] = useState<Market>(MARKETS[4]);
  const feed = useSimulatedMarket(market.id, market.decimals, market.start, market.vol);
  const ticks = feed.ticks.map(t => t.quote);
  const [group, setGroup] = useState<Group>('OVER_UNDER');
  const [barrier, setBarrier] = useState(5);
  const [stake, setStake] = useState('10');
  const [duration, setDuration] = useState(5);
  const [sound, setSound] = useState(true);
  useEffect(() => { setSound(soundEnabled()); }, []);
  const [running, setRunning] = useState<null | { contract: string; total: number; entry: number; entryEpoch: number; left: number; digit: number; won: boolean; profit: number; balance: number }>(null);
  const [lastResult, setLastResult] = useState<null | { won: boolean; profit: number; digit: number }>(null);
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [sessionPnl, setSessionPnl] = useState(0);
  const [limitHit, setLimitHit] = useState<null | 'profit' | 'loss'>(null);
  const [autoSide, setAutoSide] = useState<0 | 1>(0);
  const [autoOn, setAutoOn] = useState(false);
  const [showLimits, setShowLimits] = useState(false);


  const account = useQuery({ queryKey: ['practice-balance', user?.id], queryFn: async () => { const { data, error } = await supabase.rpc('get_practice_account'); if (error) throw error; return Number(data); } });
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const isReal = accountType === 'real';
  const realFunds = useQuery({ queryKey: ['real-balance', user?.id], enabled: !!user && isReal, queryFn: async () => {
    const [{ data: deps, error: e1 }, { data: wds, error: e2 }] = await Promise.all([
      supabase.from('deposits').select('amount, status'),
      supabase.from('withdrawal_requests').select('amount, status'),
    ]);
    if (e1) throw e1; if (e2) throw e2;
    const deposited = (deps ?? []).filter(d => d.status === 'completed').reduce((s, d) => s + Number(d.amount), 0);
    const withdrawn = (wds ?? []).filter(w => w.status === 'completed').reduce((s, w) => s + Number(w.amount), 0);
    return deposited - withdrawn;
  } });

  // Demo outcomes are settled by the simulator, independent of the displayed ticks.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => {
      if (running.left > 1) { sounds.tick(); setRunning({ ...running, left: running.left - 1 }); return; }
      if (running.won) sounds.win(); else sounds.loss();
      setLastResult({ won: running.won, profit: running.profit, digit: running.digit });
      qc.setQueryData(['practice-balance', user?.id], running.balance);
      void qc.invalidateQueries({ queryKey: ['practice-trades', user?.id] });
      toast[running.won ? 'success' : 'error'](running.won ? `Won ${money(running.profit)} USD` : `Lost ${money(-running.profit)} USD`, { description: `Demo exit digit: ${running.digit}` });
      const pnl = sessionPnl + Number(running.profit);
      setSessionPnl(pnl);
      const tp = Number(takeProfit), sl = Number(stopLoss);
      if (tp > 0 && pnl >= tp) { setLimitHit('profit'); toast.success(`Target profit reached (+${money(pnl)} USD) — trading paused`); }
      else if (sl > 0 && -pnl >= sl) { setLimitHit('loss'); toast.error(`Stop loss reached (${money(pnl)} USD) — trading paused`); }
      setRunning(null);
    }, 1000);
    return () => clearTimeout(id);
  }, [running, qc, user?.id]);

  // Auto trade: keep buying the chosen side until stopped or a session limit is hit.
  useEffect(() => {
    if (!autoOn || running) return;
    if (limitHit || isReal) { setAutoOn(false); return; }
    const id = setTimeout(() => { const side = (GROUPS.find(x => x.id === group) ?? GROUPS[0])?.sides[autoSide]; if (!side) return; void buy(side).then(ok => { if (!ok) setAutoOn(false); }); }, 900);
    return () => clearTimeout(id);
  });

  const price = ticks[ticks.length - 1] ?? 0;
  const prev = ticks[ticks.length - 2] ?? price;
  const digit = ticks.length ? lastDigit(price, feed.decimals) : 0;
  const stats = useMemo(() => { const c = Array(10).fill(0); ticks.slice(-100).forEach(t => c[lastDigit(t, feed.decimals)]++); return c.map(n => (ticks.length ? (n / Math.min(ticks.length, 100)) * 100 : 0)); }, [ticks, feed.decimals]);
  const g = GROUPS.find(x => x.id === group) ?? GROUPS[0];
  const stakeNum = Number(stake);
  const validStake = stakeNum >= 0.35 && stakeNum <= 5000;
  const barrierOptions = NO_DIGIT(group) ? [] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  async function buy(contract: string): Promise<boolean> {
    if (running) return false;
    if (!validStake) { toast.error('Stake must be between 0.35 and 5,000 USD'); return false; }
    if (contract === 'OVER' && barrier > 8) { toast.error('Over needs a prediction from 0 to 8'); return false; }
    if (contract === 'UNDER' && barrier < 1) { toast.error('Under needs a prediction from 1 to 9'); return false; }
    const { data, error } = await supabase.rpc('place_practice_trade', { _market: market.id, _contract: contract, _barrier: NO_DIGIT(group) ? 0 : barrier, _stake: stakeNum });
    if (error) { toast.error(error.message); return false; }
    const r = data as { exit_digit: number; won: boolean; profit: number; balance: number };
    qc.setQueryData(['practice-balance', user?.id], (b: number | undefined) => (b ?? 0) - stakeNum);
    setLastResult(null);
    sounds.buy();
    setRunning({ contract, total: duration, entry: price, entryEpoch: feed.ticks.at(-1)?.epoch ?? 0, left: duration, digit: r.exit_digit, won: r.won, profit: Number(r.profit), balance: Number(r.balance) });
    return true;
  }
  async function reset(): Promise<void> {
    const { error } = await supabase.rpc('reset_practice_account');
    if (error) { toast.error(error.message); return; }
    qc.setQueryData(['practice-balance', user?.id], 10000); toast.success('Practice balance reset to 10,000.00 USD');
  }

  if (!g) return null;
  return <div className="trade-shell"><SiteHeader /><main className="trade-page">
    <div className="trade-topbar">
      <select className="trade-select" value={market.id} onChange={e => { const next = MARKETS.find(m => m.id === e.target.value); if (next && !running) setMarket(next); }} disabled={!!running} aria-label="Market">{MARKETS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <div className="trade-balance"><Button asChild size="sm" className="trade-deposit-btn"><Link to="/dashboard"><ArrowDownToLine /> Deposit</Link></Button><div className="account-switcher" role="tablist" aria-label="Account type"><button role="tab" aria-selected={!isReal} className={!isReal ? 'selected' : ''} onClick={() => setAccountType('demo')} disabled={!!running}>Demo</button><button role="tab" aria-selected={isReal} className={isReal ? 'selected' : ''} onClick={() => setAccountType('real')} disabled={!!running}><img src="/usa-flag.svg" alt="" /> Real</button></div><span className="demo-badge">{isReal ? 'Real' : 'Demo'}</span><strong>{isReal ? (realFunds.data != null ? money(realFunds.data) : '…') : account.data != null ? money(account.data) : '…'} USD</strong>{!isReal && <Button variant="ghost" size="icon" onClick={reset} aria-label="Reset practice balance" disabled={!!running}><RotateCcw /></Button>}</div>
    </div>
    <div className="trade-layout">
      <section className="trade-chart-card">
        <div className="live-market-heading"><div><p className="section-kicker">SIMULATED MARKET DATA</p><h1>{market.name}</h1></div><span className={`feed-status ${feed.status}`} role="status"><i />{feed.status === 'live' ? 'Live' : feed.status === 'connecting' ? 'Connecting' : 'Disconnected'}</span></div>
        <div className="live-market-price"><strong className={price >= prev ? 'up' : 'down'}>{ticks.length ? price.toFixed(feed.decimals) : '—'}</strong><span className={price >= prev ? 'up' : 'down'}>{ticks.length > 1 ? `${price >= prev ? '+' : ''}${(price - prev).toFixed(feed.decimals)}` : '—'}</span><small>{feed.updated ? new Date(feed.updated * 1000).toISOString().slice(11, 19) + ' UTC' : 'Awaiting prices'}</small></div>
        {feed.error && <div className="feed-error" role="alert">{feed.error}<Button variant="outline" size="sm" onClick={feed.reconnect}>Reconnect</Button></div>}
        <MarketChart ticks={feed.ticks} decimals={feed.decimals} symbol={market.id} position={running ? { entry: running.entry, entryEpoch: running.entryEpoch, contract: running.contract, left: running.left, total: running.total, won: running.won } : null} />
        <div className="digit-stats-heading"><h2>Last digit distribution</h2><span>{Math.min(ticks.length, 100)} market ticks · Last digit {ticks.length ? digit : '—'}</span></div>
        <div className="digit-row" aria-label="Last digit statistics">{stats.map((s, d) => <div key={d} className={`digit-cell ${d === digit ? 'current' : ''} ${s === Math.max(...stats) ? 'hi' : ''} ${s === Math.min(...stats) ? 'lo' : ''}`}><span className="digit-num">{d}</span><small>{s.toFixed(1)}%</small></div>)}</div>
        <p className="trade-hint">Source: SOSDERIV · Simulated prices for practice only.</p>
        {running && <div className="trade-status tick-tracker"><span>{running.contract.toLowerCase()} · entry {running.entry.toFixed(feed.decimals)}</span><span className="tick-dots" aria-label={`${running.total - running.left} of ${running.total} ticks`}>{Array.from({ length: running.total }, (_, i) => <i key={i} className={i < running.total - running.left ? 'done' : i === running.total - running.left ? 'now' : ''} />)}</span><span>{running.left} left</span></div>}
        {lastResult && !running && <div className={`trade-status ${lastResult.won ? 'won' : 'lost'}`}>{lastResult.won ? `You won ${money(lastResult.profit)} USD` : `You lost ${money(-lastResult.profit)} USD`} — demo exit digit {lastResult.digit}</div>}
      </section>
      <aside className="trade-panel">
        <div className="ticket-heading"><label className="ticket-contract"><span>Contract</span><select aria-label="Contract type" value={group} onChange={e => setGroup(e.target.value as Group)} disabled={!!running}>{GROUPS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><Button variant="ghost" size="icon" aria-label={sound ? 'Mute sounds' : 'Turn on sounds'} onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}>{sound ? <Volume2 /> : <VolumeX />}</Button><Button variant="ghost" size="icon" aria-label="Target profit and stop loss" aria-pressed={showLimits} className={showLimits || takeProfit || stopLoss ? 'active' : ''} onClick={() => setShowLimits(!showLimits)}><SlidersHorizontal /></Button><Button asChild variant="ghost" size="sm"><Link to="/positions"><History /> <span className="hide-xs">Positions</span></Link></Button></div>
        {barrierOptions.length > 0 && <div className="prediction-control"><span className="trade-label">Digit</span><div className="tick-picker" aria-label="Last digit prediction">{barrierOptions.map(n => <Button variant="ghost" key={n} aria-label={`Predict digit ${n}`} aria-pressed={n === barrier} className={n === barrier ? 'active' : ''} onClick={() => setBarrier(n)} disabled={!!running}>{n}</Button>)}</div></div>}
        <div className="ticket-fields"><label className="ticket-field" htmlFor="duration"><span>Duration (ticks)</span><select id="duration" value={duration} onChange={e => setDuration(Number(e.target.value))} disabled={!!running}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} tick{n === 1 ? "" : "s"}</option>)}</select></label><label className="ticket-field" htmlFor="stake"><span>Stake (USD)</span><input id="stake" type="number" min={0.35} max={5000} step={0.01} value={stake} onChange={e => setStake(e.target.value)} disabled={!!running} /></label></div>
        <div className="stake-chips" aria-label="Quick stake"><button type="button" onClick={() => setStake('0.35')} disabled={!!running}>Min</button>{STAKE_CHIPS.map(v => <button type="button" key={v} className={stakeNum === v ? 'active' : ''} onClick={() => setStake(String(v))} disabled={!!running}>${v}</button>)}<button type="button" onClick={() => setStake(String(Math.min(5000, Math.floor((account.data ?? 0) * 100) / 100)))} disabled={!!running}>Max</button></div>
        {validStake && probability(g.sides[0], barrier) > 0 && <p className="payout-preview">Payout <strong>{money(stakeNum * 0.95 / probability(g.sides[0], barrier))} USD</strong> <span>(+{Math.round((0.95 / probability(g.sides[0], barrier) - 1) * 100)}%)</span></p>}
        {showLimits && <div className="ticket-fields"><label className="ticket-field" htmlFor="take-profit"><span>Target profit (USD)</span><input id="take-profit" type="number" min={0} step={0.01} placeholder="Off" value={takeProfit} onChange={e => { setTakeProfit(e.target.value); setLimitHit(null); }} disabled={!!running} /></label><label className="ticket-field" htmlFor="stop-loss"><span>Stop loss (USD)</span><input id="stop-loss" type="number" min={0} step={0.01} placeholder="Off" value={stopLoss} onChange={e => { setStopLoss(e.target.value); setLimitHit(null); }} disabled={!!running} /></label></div>}
        {(sessionPnl !== 0 || limitHit) && <div className={`session-pnl ${limitHit ? (limitHit === 'profit' ? 'won' : 'lost') : ''}`} role="status"><span>Session P/L: <strong className={sessionPnl >= 0 ? 'up' : 'down'}>{sessionPnl >= 0 ? '+' : ''}{money(sessionPnl)} USD</strong></span>{limitHit ? <><span>{limitHit === 'profit' ? 'Target profit reached — trading paused' : 'Stop loss reached — trading paused'}</span><Button variant="ghost" size="sm" onClick={() => { setLimitHit(null); setSessionPnl(0); }}>Resume</Button></> : <Button variant="ghost" size="sm" onClick={() => setSessionPnl(0)}>Reset</Button>}</div>}
        <div className="ticket-buy-actions">{g.sides.map((c, i) => { const p = probability(c, barrier); const disabled = isReal || !!running || !!limitHit || !validStake || (c === 'OVER' && barrier > 8) || (c === 'UNDER' && barrier < 1); const payout = validStake && p > 0 ? (stakeNum * 0.95) / p : 0; return <Button key={c} className={`buy-btn ${i === 0 ? 'buy-up' : 'buy-down'}`} onClick={() => void buy(c)} disabled={disabled || autoOn}>{i === 0 ? <TrendingUp /> : <TrendingDown />}<span><strong>{g.labels[i]}{!NO_DIGIT(group) ? ` ${barrier}` : ''}</strong><small>Payout {money(payout)} USD</small></span></Button>; })}</div>
        <div className="auto-trade-bar"><div className="auto-side" role="radiogroup" aria-label="Auto trade side">{g.labels.map((l, i) => <button key={l} type="button" role="radio" aria-checked={autoSide === i} className={autoSide === i ? 'selected' : ''} onClick={() => setAutoSide(i as 0 | 1)} disabled={autoOn}>{l}</button>)}</div><Button className={`auto-trade-btn ${autoOn ? 'on' : ''}`} variant={autoOn ? 'outline' : 'default'} onClick={() => setAutoOn(!autoOn)} disabled={!autoOn && (isReal || !!limitHit || !validStake)}>{autoOn ? <><Square /> Stop auto</> : <><Play /> Auto trade</>}</Button><Button asChild variant="ghost" size="icon" aria-label="Open trading bot"><Link to="/bot"><BotIcon /></Link></Button></div>
        {isReal && <p className="ticket-disclaimer" role="status">Real trading is not available yet — live trading opens when the platform goes live. Switch to Demo to practise.</p>}
        {running && <p className="ticket-disclaimer" role="status">{`${running.contract.replace('_', ' ')} · ${running.left} tick${running.left === 1 ? "" : "s"} remaining`}</p>}
      </aside>
    </div>
  </main></div>;
}
