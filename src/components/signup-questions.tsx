import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type Onboarding = { fullName: string; country: string; experience: string; markets: string[]; goal: string; adult: boolean; risk: boolean };
export const EMPTY_ONBOARDING: Onboarding = { fullName: '', country: '', experience: '', markets: [], goal: '', adult: false, risk: false };
export const ONBOARDING_STEPS = ['About you', 'Experience', 'Your goals', 'Account'];

const COUNTRIES = ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana', 'South Africa', 'United States', 'United Kingdom', 'Other'];
const EXPERIENCE = [['new', 'New to trading', 'I’m just getting started'], ['some', 'Some experience', 'I’ve placed a few trades'], ['experienced', 'Experienced', 'I trade regularly']];
const MARKETS = ['Synthetic indices', 'Forex', 'Crypto', 'Commodities', 'Stock indices'];
const GOALS = [['learn', 'Learn how markets work'], ['extra', 'Earn extra income'], ['strategy', 'Test my strategies'], ['bots', 'Automate with bots']];

export function stepValid(step: number, d: Onboarding) {
  if (step === 0) return d.fullName.trim().length >= 2 && !!d.country;
  if (step === 1) return !!d.experience && d.markets.length > 0;
  if (step === 2) return !!d.goal && d.adult && d.risk;
  return true;
}

export function StepIndicator({ step }: { step: number }) {
  return <ol className="onboard-steps" aria-label="Sign-up progress">{ONBOARDING_STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}><span>{i < step ? <Check size={12} /> : i + 1}</span><small>{s}</small></li>)}</ol>;
}

export function SignupQuestions({ step, data, set, onNext, onBack }: { step: number; data: Onboarding; set: (d: Onboarding) => void; onNext: () => void; onBack: () => void }) {
  const ok = stepValid(step, data);
  return <form className="auth-form" onSubmit={e => { e.preventDefault(); if (ok) onNext(); }}>
    {step === 0 && <>
      <div className="auth-field"><label htmlFor="fullName">Full name</label><Input id="fullName" autoComplete="name" placeholder="As shown on your ID" value={data.fullName} onChange={e => set({ ...data, fullName: e.target.value })} /></div>
      <div className="auth-field"><label htmlFor="country">Country of residence</label><select id="country" className="onboard-select" value={data.country} onChange={e => set({ ...data, country: e.target.value })}><option value="">Select your country</option>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></div>
    </>}
    {step === 1 && <>
      <div className="auth-field"><label>How much trading experience do you have?</label><div className="onboard-options">{EXPERIENCE.map(([id, t, s]) => <button type="button" key={id} aria-pressed={data.experience === id} className={data.experience === id ? 'active' : ''} onClick={() => set({ ...data, experience: id! })}><strong>{t}</strong><small>{s}</small></button>)}</div></div>
      <div className="auth-field"><label>Which markets interest you?</label><div className="onboard-chips">{MARKETS.map(m => { const on = data.markets.includes(m); return <button type="button" key={m} aria-pressed={on} className={on ? 'active' : ''} onClick={() => set({ ...data, markets: on ? data.markets.filter(x => x !== m) : [...data.markets, m] })}>{on && <Check size={14} />}{m}</button>; })}</div></div>
    </>}
    {step === 2 && <>
      <div className="auth-field"><label>What’s your main goal?</label><div className="onboard-options">{GOALS.map(([id, t]) => <button type="button" key={id} aria-pressed={data.goal === id} className={data.goal === id ? 'active' : ''} onClick={() => set({ ...data, goal: id! })}><strong>{t}</strong></button>)}</div></div>
      <label className="onboard-check"><input type="checkbox" checked={data.adult} onChange={e => set({ ...data, adult: e.target.checked })} /> I confirm I am at least 18 years old.</label>
      <label className="onboard-check"><input type="checkbox" checked={data.risk} onChange={e => set({ ...data, risk: e.target.checked })} /> I understand trading involves risk and I may lose my stake.</label>
    </>}
    <div className="onboard-nav">{step > 0 && <Button type="button" variant="outline" onClick={onBack}><ArrowLeft /> Back</Button>}<Button variant="hero" type="submit" disabled={!ok}>Continue <ArrowRight /></Button></div>
  </form>;
}
