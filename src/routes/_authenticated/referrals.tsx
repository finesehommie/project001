import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Share2, UserPlus, Wallet, TrendingUp, CheckCircle2, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/components/session-context';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/page-head';
import { referralCodeFor } from '@/lib/referral';

export const Route = createFileRoute('/_authenticated/referrals')({
  head: () => pageHead('Refer & Earn | SOSDERIV', 'Invite friends to SOSDERIV and earn a bonus when they make their first deposit and trade.'),
  component: ReferralsPage,
});

function ReferralsPage() {
  const { user } = useSession();
  const code = user ? referralCodeFor(user.id) : '';
  const link = typeof window !== 'undefined' && code ? `${window.location.origin}/auth?mode=signup&ref=${code}` : '';
  const reward = useQuery({ queryKey: ['referral-reward'], queryFn: async () => { const { data, error } = await supabase.rpc('get_referral_reward'); if (error) throw error; return Number(data); } });
  const refs = useQuery({ queryKey: ['my-referrals', user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from('referrals').select('*').eq('referrer_id', user!.id).order('created_at', { ascending: false });
    if (error) throw error; return data;
  } });
  const list = refs.data ?? [];
  const earned = list.reduce((s, r) => s + Number(r.reward ?? 0), 0);
  const qualified = list.filter(r => r.status === 'rewarded').length;
  const copy = async (text: string) => { await navigator.clipboard.writeText(text); toast.success('Copied'); };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Join me on SOSDERIV', text: 'Trade digits and Rise/Fall on SOSDERIV.', url: link }); } catch { /* cancelled */ } }
    else void copy(link);
  };
  const amt = reward.data ?? 10;

  return <><SiteHeader /><main className="settings-page container-wide pb-28">
    <header><p className="section-kicker">REFER &amp; EARN</p><h1>Invite friends, earn {amt} USD each</h1>
      <p className="text-muted-foreground mt-1">You’re rewarded only when your friend completes their first deposit <strong>and</strong> places their first trade.</p></header>

    <section className="settings-card">
      <h2><Gift /> Your invite link</h2>
      <div className="flex gap-2"><Input readOnly aria-label="Referral link" value={link} /><Button onClick={() => void copy(link)} aria-label="Copy link"><Copy /></Button></div>
      <div className="flex flex-wrap items-center gap-3 mt-3"><span className="text-sm text-muted-foreground">Code</span><button className="font-mono text-lg font-bold tracking-widest text-primary" onClick={() => void copy(code)}>{code}</button>
        <Button variant="outline" className="ml-auto" onClick={() => void share()}><Share2 /> Share</Button></div>
    </section>

    <section className="grid grid-cols-3 gap-3">
      {[['Invited', list.length], ['Qualified', qualified], ['Earned', `${earned.toFixed(2)} USD`]].map(([l, v]) =>
        <div key={l as string} className="settings-card text-center"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold">{v}</p></div>)}
    </section>

    <section className="settings-card">
      <h2>How it works</h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[[UserPlus, 'Friend signs up', 'They join with your link or code.'], [Wallet, 'First deposit', 'Their first deposit is completed.'], [TrendingUp, 'First trade', `They place a trade — ${amt} USD lands in your Real balance.`]].map(([Icon, t, d], i) => {
          const I = Icon as typeof UserPlus;
          return <li key={i} className="flex gap-3"><I className="text-primary shrink-0" /><div><strong>{t as string}</strong><p className="text-sm text-muted-foreground">{d as string}</p></div></li>;
        })}
      </ol>
    </section>

    <section className="settings-card">
      <h2>Your referrals</h2>
      {list.length === 0 ? <p className="text-muted-foreground text-sm">No referrals yet — share your link to get started.</p> :
        <ul className="grid gap-2">{list.map(r => <li key={r.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
          <span>Friend · joined {new Date(r.created_at).toLocaleDateString()}</span>
          {r.status === 'rewarded' ? <span className="flex items-center gap-1 text-primary"><CheckCircle2 size={16} /> +{Number(r.reward).toFixed(2)} USD</span>
            : <span className="flex items-center gap-1 text-muted-foreground"><Clock3 size={16} /> Waiting for deposit &amp; trade</span>}
        </li>)}</ul>}
    </section>
  </main></>;
}
