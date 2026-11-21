import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, TrendingUp } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSession } from '@/components/session-context';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/page-head';
import { tradeStats } from '@/lib/bot-presets';

export const Route = createFileRoute('/_authenticated/positions')({
  head: () => pageHead('Positions & Trade History | Option Market Traders', 'Review your demo contracts, win rate, profit factor, streaks and full trade receipts on Option Market Traders.'),
  component: PositionsPage,
});

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MARKETS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];

function PositionsPage() {
  const { user } = useSession();
  const [market, setMarket] = useState('all');
  const [outcome, setOutcome] = useState<'all' | 'won' | 'lost'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const history = useQuery({ queryKey: ['practice-trades', user?.id, 'all'], queryFn: async () => {
    const { data, error } = await supabase.from('practice_trades').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return data;
  } });
  const rows = useMemo(() => (history.data ?? []).filter(t => (market === 'all' || t.market === market) && (outcome === 'all' || (outcome === 'won') === t.won)), [history.data, market, outcome]);
  const stats = tradeStats(rows.map(t => ({ won: t.won, profit: Number(t.profit), stake: Number(t.stake) })));
  const open = rows.find(t => t.id === openId) ?? null;

  return <><SiteHeader /><main className="positions-page container-wide">
    <header className="positions-heading"><div><p className="section-kicker">DEMO ACCOUNT</p><h1>Positions</h1><p className="text-muted-foreground text-sm mt-2">Performance and trade history</p></div><Button asChild variant="outline"><Link to="/trade"><TrendingUp /> Trade</Link></Button></header>
    <div className="perf-grid">
      <div><span>Net P/L</span><strong className={stats.net >= 0 ? 'up' : 'down'}>{stats.net >= 0 ? '+' : ''}{money(stats.net)}</strong></div>
      <div><span>Win rate</span><strong>{stats.winRate}%</strong></div>
      <div><span>Trades</span><strong>{stats.total}</strong></div>
      <div><span>Profit factor</span><strong>{stats.profitFactor ?? '—'}</strong></div>
      <div><span>Best streak</span><strong>{stats.bestStreak}</strong></div>
      <div><span>Volume</span><strong>{money(stats.volume)}</strong></div>
    </div>
    <div className="positions-filters">
      <select aria-label="Filter by market" value={market} onChange={e => setMarket(e.target.value)}><option value="all">All markets</option>{MARKETS.map(m => <option key={m} value={m}>Volatility {m.replace('R_', '')}</option>)}</select>
      <div className="filter-pills" role="group" aria-label="Filter by outcome">{(['all', 'won', 'lost'] as const).map(o => <button key={o} type="button" className={outcome === o ? 'active' : ''} onClick={() => setOutcome(o)}>{o === 'all' ? 'All' : o === 'won' ? 'Won' : 'Lost'}</button>)}</div>
    </div>
    {history.isPending ? <p role="status" className="text-muted-foreground">Loading positions…</p> : history.error ? <div role="alert"><p>Trade history could not be loaded.</p><Button variant="outline" onClick={() => history.refetch()}>Retry</Button></div> : rows.length ? <div className="position-list">{rows.map(t => <button type="button" className="position-row" key={t.id} onClick={() => setOpenId(t.id)}>
      <div className="position-row-heading"><strong>{t.contract_type}{t.barrier != null ? ` ${t.barrier}` : ''}</strong><span className={t.won ? 'up' : 'down'}>{t.won ? 'Won' : 'Lost'}</span></div>
      <p className="position-market">Volatility {t.market.replace('R_', '')} Index · {new Date(t.created_at).toLocaleString()}</p>
      <dl className="position-details"><div><dt>Stake</dt><dd>{money(Number(t.stake))} USD</dd></div><div><dt>Exit digit</dt><dd>{t.exit_digit}</dd></div><div><dt>Profit / Loss</dt><dd className={t.won ? 'up' : 'down'}>{Number(t.profit) > 0 ? '+' : ''}{money(Number(t.profit))} USD</dd></div></dl>
    </button>)}</div> : <div className="account-empty"><Clock3 /><h3>No positions match</h3><Button asChild variant="outline"><Link to="/trade">Trade with demo</Link></Button></div>}
    <Dialog open={!!open} onOpenChange={o => { if (!o) setOpenId(null); }}><DialogContent>
      {open && <><DialogHeader><DialogTitle>Contract receipt</DialogTitle><DialogDescription>Reference {open.id.slice(0, 8).toUpperCase()}</DialogDescription></DialogHeader>
        <dl className="receipt">
          <div><dt>Market</dt><dd>Volatility {open.market.replace('R_', '')} Index</dd></div>
          <div><dt>Contract</dt><dd>{open.contract_type}{open.barrier != null ? ` ${open.barrier}` : ''}</dd></div>
          <div><dt>Time</dt><dd>{new Date(open.created_at).toLocaleString()}</dd></div>
          <div><dt>Stake</dt><dd>{money(Number(open.stake))} USD</dd></div>
          <div><dt>Potential payout</dt><dd>{money(Number(open.payout))} USD</dd></div>
          <div><dt>Exit digit</dt><dd>{open.exit_digit}</dd></div>
          <div><dt>Result</dt><dd className={open.won ? 'up' : 'down'}>{open.won ? 'Won' : 'Lost'} {Number(open.profit) > 0 ? '+' : ''}{money(Number(open.profit))} USD</dd></div>
          <div><dt>Balance after</dt><dd>{money(Number(open.balance_after))} USD</dd></div>
        </dl></>}
    </DialogContent></Dialog>
  </main></>;
}
