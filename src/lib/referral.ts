import { supabase } from '@/integrations/supabase/client';

const KEY = 'sosderiv:ref';

export function referralCodeFor(userId: string) {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
export function isValidCode(code: string | null | undefined): code is string {
  return !!code && /^[A-Z0-9]{8}$/i.test(code.trim());
}
/** Save ?ref=CODE from the URL so it survives sign-up and email confirmation. */
export function captureReferralFromUrl() {
  if (typeof window === 'undefined') return;
  const code = new URLSearchParams(window.location.search).get('ref');
  if (isValidCode(code)) localStorage.setItem(KEY, code.trim().toUpperCase());
}
/** Link the signed-in user to their referrer once, then forget the code. */
export async function claimStoredReferral(userId: string) {
  const code = localStorage.getItem(KEY);
  if (!isValidCode(code)) return;
  if (code === referralCodeFor(userId)) { localStorage.removeItem(KEY); return; }
  const { error } = await supabase.rpc('claim_referral', { _code: code });
  if (!error) localStorage.removeItem(KEY);
}
