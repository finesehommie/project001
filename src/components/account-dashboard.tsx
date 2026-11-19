import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, FlaskConical, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CRYPTO_COINS, simulatedInvoice, type CoinId } from '@/lib/crypto-pay';
import { useSession } from '@/components/session-context';
import { supabase } from '@/integrations/supabase/client';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AccountDashboard() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<'demo' | 'real'>('demo');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fundsDialog, setFundsDialog] = useState<'deposit' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Crypto');
  const [submitting, setSubmitting] = useState(false);
  const [coin, setCoin] = useState<CoinId>('USDTTRC20');
  const [invoice, setInvoice] = useState<ReturnType<typeof simulatedInvoice> | null>(null);
  const isCrypto = method === 'Crypto';

  const account = useQuery({ queryKey: ['practice-balance', user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.rpc('get_practice_account'); if (error) throw error; return Number(data); } });
  const history = useQuery({ queryKey: ['practice-trades', user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.from('practice_trades').select('*').order('created_at', { ascending: false }).limit(20); if (error) throw error; return data; } });
  const deposits = useQuery({ queryKey: ['my-deposits', user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.from('deposits').select('*').order('created_at', { ascending: false }).limit(50); if (error) throw error; return data; } });
  const withdrawals = useQuery({ queryKey: ['my-withdrawals', user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }).limit(50); if (error) throw error; return data; } });
  const demoComplianceAmount = useQuery({
    queryKey: ['withdrawal-demo-compliance-amount'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'withdrawal_demo_compliance_amount').maybeSingle();
      if (error) throw error;
      return Number(data?.value ?? 0);
    },
  });

  const rows = history.data ?? [];
  const profit = rows.reduce((sum, row) => sum + Number(row.profit), 0);
  const deposited = (deposits.data ?? []).filter(d => d.status === 'completed').reduce((s, d) => s + Number(d.amount), 0);
  const withdrawn = (withdrawals.data ?? []).filter(w => w.status === 'completed').reduce((s, w) => s + Number(w.amount), 0);
  const realBalance = deposited - withdrawn;

  async function reset() {
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc('reset_practice_account');
      if (error) throw error;
      qc.setQueryData(['practice-balance', user?.id], Number(data));
      setConfirmReset(false); toast.success('Demo balance reset to 10,000.00 USD');
    } catch { toast.error('Unable to reset your balance. Please try again.'); }
    finally { setResetting(false); }
  }

  async function submitFunds(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) { toast.error('Enter an amount greater than zero.'); return; }
    if (fundsDialog === 'withdraw' && value > realBalance) { toast.error('Amount is more than your available balance.'); return; }
    if (fundsDialog === 'deposit' && isCrypto && !invoice) { setInvoice(simulatedInvoice(coin, value)); return; }
    setSubmitting(true);
    const { error } = fundsDialog === 'deposit'
      ? await supabase.from('deposits').insert({ user_id: user!.id, amount: value, method: isCrypto && invoice ? `Crypto ${invoice.coin.label} · ${invoice.paymentId}` : method, status: 'pending' })
      : await supabase.from('withdrawal_requests').insert({ user_id: user!.id, amount: value, method });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(fundsDialog === 'deposit' ? 'Deposit request sent. It will appear once confirmed.' : 'Withdrawal request sent. You will see it once processed.');
    setFundsDialog(null); setAmount(''); setInvoice(null);
    qc.invalidateQueries({ queryKey: ['my-deposits', user?.id] });
    qc.invalidateQueries({ queryKey: ['my-withdrawals', user?.id] });
  }

  const fundRows = [
    ...(deposits.data ?? []).map(d => ({ id: d.id, kind: 'Deposit', date: d.created_at, amount: Number(d.amount), status: d.status })),
    ...(withdrawals.data ?? []).map(w => ({ id: w.id, kind: 'Withdrawal', date: w.created_at, amount: -Number(w.amount), status: w.status })),
  ].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 20);

  return <main className="account-page container-wide">
    <div className="account-heading"><div><p className="section-kicker">YOUR TRADING ACCOUNTS</p><h1>Balance dashboard</h1></div><span className="account-currency">Account currency <strong>USD</strong></span></div>
    <div className="account-switch" role="tablist" aria-label="Account type">
      <Button variant="ghost" role="tab" aria-selected={selected === 'demo'} aria-controls="account-panel" id="demo-tab" className={selected === 'demo' ? 'selected' : ''} onClick={() => { setSelected('demo'); setConfirmReset(false); }}><FlaskConical /> Demo account <span className="account-tag">Virtual</span></Button>
      <Button variant="ghost" role="tab" aria-selected={selected === 'real'} aria-controls="account-panel" id="real-tab" className={selected === 'real' ? 'selected' : ''} onClick={() => { setSelected('real'); setConfirmReset(false); }}><img src="/usa-flag.svg" alt="USA flag" className="account-flag" /> Real account <span className="account-tag">USD</span></Button>
    </div>
    <section id="account-panel" role="tabpanel" aria-labelledby={`${selected}-tab`}>
      <div className="account-balance-band"><div><div className="account-balance-label"><Wallet size={18} /> {selected === 'demo' ? 'Available demo balance' : 'Real account balance'}</div><div className="account-balance-number">{selected === 'real' ? (deposits.isPending || withdrawals.isPending ? '…' : money(realBalance)) : account.isError ? 'Unavailable' : account.data != null ? money(account.data) : '…'} <span>USD</span></div><p>{selected === 'demo' ? 'Virtual funds · No real money at risk' : 'Funded by confirmed deposits'}</p></div><div className="account-balance-actions">{selected === 'demo' ? <><Button asChild size="lg"><Link to="/trade">Trade with demo <ArrowUpRight /></Link></Button><Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={account.isPending || account.isError || resetting}><RotateCcw /> Reset balance</Button></> : <><Button size="lg" onClick={() => setFundsDialog('deposit')}><ArrowDownToLine /> Deposit</Button><Button variant="outline" size="lg" onClick={() => setFundsDialog('withdraw')} disabled={realBalance <= 0}><ArrowUpFromLine /> Withdraw</Button></>}</div></div>
      {account.isError && selected === 'demo' && <div className="account-notice" role="alert">Your balance could not be loaded.<Button variant="outline" onClick={() => void account.refetch()}>Try again</Button></div>}
      {confirmReset && selected === 'demo' && <div className="account-notice"><div><strong>Reset demo funds?</strong><p>Your balance will return to 10,000.00 USD. Trade history is kept.</p></div><div className="account-inline-actions"><Button variant="outline" onClick={() => setConfirmReset(false)} disabled={resetting}>Cancel</Button><Button onClick={reset} disabled={resetting}>{resetting ? 'Resetting…' : 'Confirm reset'}</Button></div></div>}
      {selected === 'real' ? <>
        <div className="account-stats"><div><span>Total deposited</span><strong>{deposits.isPending ? '—' : money(deposited)} <small>USD</small></strong></div><div><span>Total withdrawn</span><strong>{withdrawals.isPending ? '—' : money(withdrawn)} <small>USD</small></strong></div><div><span>Pending requests</span><strong>{deposits.isPending || withdrawals.isPending ? '—' : fundRows.filter(r => r.status === 'pending').length}</strong></div></div>
        <section className="account-activity"><div className="account-section-heading"><h2>Funds activity</h2><span>Deposits and withdrawals</span></div>{fundRows.length ? <div className="account-table-wrap"><table><thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{fundRows.map(row => <tr key={row.id}><td>{row.kind}</td><td>{new Date(row.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td className={row.amount >= 0 ? 'up' : 'down'}>{row.amount >= 0 ? '+' : ''}{money(row.amount)} USD</td><td>{row.status}</td></tr>)}</tbody></table></div> : <div className="account-empty"><Wallet size={28} /><h3>No funds activity yet</h3><p>Use Deposit to fund your Real account.</p></div>}</section>
      </> : <>
        <div className="account-stats"><div><span>Recent profit / loss</span><strong className={profit >= 0 ? 'up' : 'down'}>{history.isError || history.isPending ? '—' : `${profit >= 0 ? '+' : ''}${money(profit)}`} <small>USD</small></strong></div><div><span>Trades in view</span><strong>{history.isError || history.isPending ? '—' : rows.length}</strong></div><div><span>Win rate</span><strong>{history.isError || history.isPending || !rows.length ? '—' : `${Math.round(rows.filter(row => row.won).length / rows.length * 100)}%`}</strong></div></div>
        <section className="account-activity"><div className="account-section-heading"><h2>Recent activity</h2><span>Latest 20 demo trades</span></div>{history.isError ? <div className="account-notice" role="alert">Activity could not be loaded.<Button variant="outline" onClick={() => void history.refetch()}>Try again</Button></div> : history.isPending ? <p className="account-empty">Loading activity…</p> : rows.length ? <div className="account-table-wrap"><table><thead><tr><th>Contract</th><th>Market</th><th>Date</th><th>Stake</th><th>Profit / loss</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.contract_type}{row.barrier != null ? ` ${row.barrier}` : ''}</td><td>Volatility {row.market.replace('R_', '')}</td><td>{new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>{money(Number(row.stake))}</td><td className={row.won ? 'up' : 'down'}>{Number(row.profit) >= 0 ? '+' : ''}{money(Number(row.profit))} USD</td></tr>)}</tbody></table></div> : <div className="account-empty"><Wallet size={28} /><h3>No trades yet</h3><p>Your demo trading activity will appear here.</p></div>}</section>
        <p className="account-footnote">Demo funds have no cash value and cannot be withdrawn.</p>
      </>}
    </section>
    <Dialog open={fundsDialog !== null} onOpenChange={open => { if (!open) { setFundsDialog(null); setInvoice(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fundsDialog === 'deposit' ? 'Deposit to Real account' : 'Withdraw from Real account'}</DialogTitle>
          <DialogDescription>
            {fundsDialog === 'deposit'
              ? 'Send a deposit request. Your balance updates once the payment is confirmed.'
              : `Available balance: ${money(realBalance)} USD. Your request will be reviewed and processed.`}
          </DialogDescription>
        </DialogHeader>
        {fundsDialog === 'withdraw' && <div role={demoComplianceAmount.isError ? 'alert' : 'note'} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong className="mb-1 inline-flex rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold tracking-wide">DEMO ONLY · SIMULATION</strong>
          <p>{demoComplianceAmount.isError
            ? 'The demo compliance sample could not be loaded. This does not affect your withdrawal request.'
            : demoComplianceAmount.isPending
              ? 'Loading the demo compliance sample…'
              : demoComplianceAmount.data
                ? `Sample amount: ${money(demoComplianceAmount.data)} USD. This is not a tax assessment or payment request. No money is collected, and this simulation never delays, deducts from, or blocks your withdrawal.`
                : 'No sample amount is configured. This simulation never delays, deducts from, or blocks your withdrawal.'}</p>
        </div>}
        <form onSubmit={submitFunds} className="grid gap-3">
          <Input aria-label="Amount" type="number" min="0.01" step="0.01" placeholder="Amount (USD)" value={amount} onChange={e => { setAmount(e.target.value); setInvoice(null); }} required />
          <select aria-label="Method" className="h-10 rounded-md border bg-background px-3" value={method} onChange={e => { setMethod(e.target.value); setInvoice(null); }}>
            <option value="Crypto">Crypto (NOWPayments)</option><option value="M-Pesa">M-Pesa</option><option value="Bank transfer">Bank transfer</option><option value="Card">Card</option>
          </select>
          {fundsDialog === 'deposit' && isCrypto && <select aria-label="Coin" className="h-10 rounded-md border bg-background px-3" value={coin} onChange={e => { setCoin(e.target.value as CoinId); setInvoice(null); }}>{CRYPTO_COINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
          {fundsDialog === 'deposit' && isCrypto && invoice && <div className="crypto-invoice">
            <span className="sim-badge">Test mode · simulated</span>
            <p>Send exactly</p><strong className="crypto-amount">{invoice.payAmount} {invoice.coin.id === 'USDTTRC20' ? 'USDT' : invoice.coin.id}</strong>
            <p>to this {invoice.coin.label} address</p>
            <code className="crypto-address">{invoice.address}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(invoice.address); toast.success('Address copied'); }}>Copy address</Button>
            <small>Payment ID {invoice.paymentId} · expires {new Date(invoice.expiresAt).toLocaleTimeString()}. This is a simulated checkout — no crypto provider is connected yet, so don't send real funds.</small>
          </div>}
          {fundsDialog === 'deposit' && !isCrypto && <p className="text-sm text-muted-foreground">After you submit, our team will send you {method} payment details. Your balance updates once the payment is confirmed.</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Sending…' : fundsDialog === 'deposit' ? (isCrypto ? (invoice ? "I've sent the payment" : 'Generate payment address') : 'Send deposit request') : 'Request withdrawal'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}
