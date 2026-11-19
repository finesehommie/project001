import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { KeyRound, UserRound, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/components/session-context';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/page-head';
import { getTheme, setTheme as saveTheme, type Theme } from '@/lib/theme';
import { setSoundEnabled, soundEnabled, sounds } from '@/lib/sounds';

export const Route = createFileRoute('/_authenticated/settings')({
  head: () => pageHead('Account Settings | SOSDERIV', 'Manage your SOSDERIV sign-in details, password and trading sound preferences.'),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useSession();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { if (user) void supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }).then(({ data }) => setIsAdmin(!!data)); }, [user]);
  const [theme, setThemeState] = useState<Theme>('dark');
  useEffect(() => { setThemeState(getTheme()); }, []);
  useEffect(() => { setSound(soundEnabled()); }, []);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (pw !== pw2) { toast.error('Passwords do not match'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPw(''); setPw2(''); toast.success('Password updated');
  }
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  return <><SiteHeader /><main className="settings-page container-wide">
    <header><p className="section-kicker">ACCOUNT</p><h1>Settings</h1></header>
    <section className="settings-card"><h2><UserRound /> Account details</h2>
      <dl className="receipt"><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Sign-in method</dt><dd style={{ textTransform: 'capitalize' }}>{provider}</dd></div><div><dt>Member since</dt><dd>{user ? new Date(user.created_at).toLocaleDateString() : '—'}</dd></div></dl>
    </section>
    <section className="settings-card"><h2><KeyRound /> Change password</h2>
      <form onSubmit={changePassword} className="grid gap-3">
        <Input type="password" aria-label="New password" placeholder="New password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
        <Input type="password" aria-label="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Button>
      </form>
    </section>
    <section className="settings-card"><h2>Appearance</h2>
      <div className="theme-choice" role="group" aria-label="Colour mode">{(['dark', 'light'] as const).map(t => <Button key={t} variant={theme === t ? 'default' : 'outline'} aria-pressed={theme === t} onClick={() => { saveTheme(t); setThemeState(t); }}>{t === 'dark' ? 'Dark mode' : 'Light mode'}</Button>)}</div>
    </section>
    <section className="settings-card"><h2>Refer &amp; earn</h2><p>Invite friends and earn a bonus after their first deposit and trade.</p><Button asChild variant="outline"><Link to="/referrals">Open referral program</Link></Button></section>
    {isAdmin && <section className="settings-card"><h2>Site name</h2><p>Change the name shown across the site from the admin panel.</p><Button asChild variant="outline"><Link to="/admin">Change site name</Link></Button></section>}
    <section className="settings-card"><h2><Volume2 /> Sounds</h2>
      <label className="bot-check"><input type="checkbox" checked={sound} onChange={e => { setSoundEnabled(e.target.checked); setSound(e.target.checked); if (e.target.checked) sounds.win(); }} /> Play sounds for purchases, ticks, wins and losses</label>
    </section>
  </main></>;
}
