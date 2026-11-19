import { describe, expect, it } from 'vitest';
import { isValidCode, referralCodeFor } from '@/lib/referral';
describe('referral codes', () => {
  it('uses the first 8 id characters, uppercased', () => {
    expect(referralCodeFor('ab12cd34-0000-0000-0000-000000000000')).toBe('AB12CD34');
  });
  it('rejects malformed codes', () => {
    expect(isValidCode('AB12')).toBe(false);
    expect(isValidCode('AB12CD34')).toBe(true);
  });
});
