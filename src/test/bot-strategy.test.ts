import { describe, expect, it } from 'vitest';
import { nextStake } from '@/routes/_authenticated/bot';

describe('bot stake strategies', () => {
  it('martingale multiplies after a loss and resets after a win', () => {
    expect(nextStake('martingale', 1, 2, false, 2)).toBe(4);
    expect(nextStake('martingale', 1, 4, true, 2)).toBe(1);
  });
  it("d'alembert adds one unit after a loss and removes one after a win", () => {
    expect(nextStake('dalembert', 1, 3, false, 2)).toBe(4);
    expect(nextStake('dalembert', 1, 3, true, 2)).toBe(2);
  });
});

describe('extra bot strategies', () => {
  it('reverse martingale doubles after a win and resets after a loss', () => {
    expect(nextStake('reverse', 1, 2, true, 2)).toBe(4);
    expect(nextStake('reverse', 1, 4, false, 2)).toBe(1);
  });
  it('1-3-2-6 walks the sequence on wins', () => {
    expect(nextStake('1326', 1, 1, true, 2)).toBe(3);
    expect(nextStake('1326', 1, 6, true, 2)).toBe(1);
    expect(nextStake('1326', 1, 3, false, 2)).toBe(1);
  });
});
