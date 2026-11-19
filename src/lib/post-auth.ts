// Where a sign-in should end up: the trading terminal.
//
// OAuth and email-confirmation round trips come back to a public URL, so the
// intent has to survive the redirect. The entry URL is captured at import time
// because the auth client strips the code from the address bar once it has
// exchanged it for a session.

export const POST_AUTH_TARGET = '/trade';
const INTENT_KEY = 'sosderiv:post-auth-target';

const ENTRY_SEARCH_AND_HASH =
  typeof window === 'undefined' ? '' : `${window.location.search}${window.location.hash}`;

export function rememberPostAuthTarget(target: string = POST_AUTH_TARGET) {
  try {
    window.sessionStorage.setItem(INTENT_KEY, target);
  } catch {
    // Storage blocked (private mode): the auth client still signs the user in.
  }
}

export function clearPostAuthTarget() {
  try {
    window.sessionStorage.removeItem(INTENT_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/** True when this page load is the tail end of a sign-in round trip. */
export function shouldOpenTerminalAfterSignIn(): boolean {
  if (typeof window === 'undefined') return false;
  // Password recovery is handled by its own page, not the terminal.
  if (window.location.pathname === '/reset-password') return false;

  const entry = new URLSearchParams(ENTRY_SEARCH_AND_HASH.replace(/^[?#]/, ''));
  const isCallback =
    entry.has('code') ||
    entry.has('access_token') ||
    entry.has('type') ||
    entry.has('error_code') ||
    window.location.pathname === '/auth';
  if (isCallback) return entry.get('type') !== 'recovery';

  try {
    return window.sessionStorage.getItem(INTENT_KEY) === POST_AUTH_TARGET;
  } catch {
    return false;
  }
}
