import { describe, expect, it } from 'vitest';
import { triggerMet, tradeStats } from '@/lib/bot-presets';
import { simulatedInvoice } from '@/lib/crypto-pay';

describe('streak trigger', () => {
  it('fires only after 3 consecutive evens', () => {
    expect(triggerMet([1, 2, 4, 6], { kind: 'even', count: 3 })).toBe(true);
    expect(triggerMet([2, 4, 5], { kind: 'even', count: 3 })).toBe(false);
  });
  it('low streak means digits 0-4', () => {
    expect(triggerMet([0, 4, 3, 1], { kind: 'low', count: 4 })).toBe(true);
    expect(triggerMet([0, 5, 3, 1], { kind: 'low', count: 4 })).toBe(false);
  });
});

describe('trade stats', () => {
  it('computes win rate, net and best streak', () => {
    const s = tradeStats([{ won: true, profit: 9, stake: 10 }, { won: true, profit: 9, stake: 10 }, { won: false, profit: -10, stake: 10 }, { won: true, profit: 9, stake: 10 }]);
    expect(s.winRate).toBe(75); expect(s.net).toBe(17); expect(s.bestStreak).toBe(2); expect(s.profitFactor).toBe(2.7);
  });
});

describe('simulated crypto invoice', () => {
  it('USDT amount equals USD amount', () => {
    expect(simulatedInvoice('USDTTRC20', 50, 1).payAmount).toBe('50.00');
  });
});

describe('repeat trigger', () => {
  it('fires only when the last digits repeat', () => {
    expect(triggerMet([1, 4, 4], { kind: 'repeat', count: 2 })).toBe(true);
    expect(triggerMet([4, 5], { kind: 'repeat', count: 2 })).toBe(false);
  });
});
