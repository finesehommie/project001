import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SignupQuestions, StepIndicator, EMPTY_ONBOARDING, type Onboarding } from '@/components/signup-questions';
import { Link, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { useSession } from '@/components/session-context';
import { POST_AUTH_TARGET, clearPostAuthTarget, rememberPostAuthTarget } from '@/lib/post-auth';

export type AuthMode = 'login' | 'signup' | 'forgot';
export function AuthForm({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(0);
  const [onboard, setOnboard] = useState<Onboarding>(EMPTY_ONBOARDING);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { user } = useSession();
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'forgot') {
        const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) throw result.error;
        setMessage('If an account exists for this email, you’ll receive a password reset link shortly.');
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { full_name: onboard.fullName, country: onboard.country, experience: onboard.experience, markets: onboard.markets, goal: onboard.goal, accepted_risk_at: new Date().toISOString() } } });
        if (result.error) throw result.error;
        if (result.data.session) await navigate({ to: '/trade' });
        else setMessage('Check your email to confirm your account. After confirmation, you can log in.');
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        await navigate({ to: '/trade' });
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError('');
    // Remembered before the redirect: the browser leaves this page mid-call.
    rememberPostAuthTarget();
    try {
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
      if (result.error) { clearPostAuthTarget(); setError(result.error.message); return; }
      if (!result.redirected) { clearPostAuthTarget(); await navigate({ to: POST_AUTH_TARGET }); }
    } catch { clearPostAuthTarget(); setError('Google sign-in could not start. Please try again.'); }
    finally { setBusy(false); }
  }
  if (user) return <div className="auth-panel"><ShieldCheck className="text-primary" /><h1>You’re logged in</h1><p>Welcome to SOSDERIV.</p><Button asChild variant="hero"><Link to={POST_AUTH_TARGET}>Open the trading terminal <ArrowRight /></Link></Button></div>;
  return <div className="auth-panel"><div className="section-kicker">SOSDERIV</div><h1>{mode === 'signup' ? 'Your next chapter starts here.' : mode === 'forgot' ? 'Reset your password' : 'Welcome back.'}</h1><p>{mode === 'signup' ? 'Create your account and take the first step.' : mode === 'forgot' ? 'Enter your email and we’ll send you a reset link.' : 'Log in to your SOSDERIV account.'}</p>{mode === 'signup' && !message && <StepIndicator step={step} />}{message ? <div className="auth-success" role="status">{message}</div> : mode === 'signup' && step < 3 ? <><SignupQuestions step={step} data={onboard} set={setOnboard} onNext={() => setStep(step + 1)} onBack={() => setStep(step - 1)} />{step === 0 && <><div className="auth-divider">or continue with</div><Button variant="outline" className="w-full h-12" onClick={google} disabled={busy}><span className="font-bold text-lg">G</span> Google</Button></>}</> : <>{mode === 'signup' && <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}><ArrowLeft /> Back</Button>}<form onSubmit={submit} className="auth-form"><div className="auth-field"><label htmlFor="email">Email address</label><Input id="email" type="email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>{mode !== 'forgot' && <div className="auth-field"><label htmlFor="password">Password</label><div className="password-wrap"><Input id="password" type={visible ? 'text' : 'password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : 1} required value={password} onChange={e => setPassword(e.target.value)} /><Button type="button" variant="ghost" size="icon" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button></div></div>}{mode === 'login' && <Link className="text-primary text-xs" to="/auth" search={{ mode: 'forgot' }}>Forgot password?</Link>}{error && <div role="alert" className="auth-error">{error}</div>}<Button variant="hero" type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null}{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'} <ArrowRight /></Button></form>{mode === 'login' && <><div className="auth-divider">or continue with</div><Button variant="outline" className="w-full h-12" onClick={google} disabled={busy}><span className="font-bold text-lg">G</span> Google</Button></>}</>}<div className="auth-switch">{mode === 'login' ? <>New here? <Link to="/auth" search={{ mode: 'signup' }}>Create an account</Link></> : <>Already have an account? <Link to="/auth" search={{ mode: 'login' }}>Log in</Link></>}</div>{mode === 'signup' && <p className="auth-legal">By creating an account, you confirm you are at least 18 years old. Trading involves risk and may not be suitable for everyone.</p>}</div>;
}