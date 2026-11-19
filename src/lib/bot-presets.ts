export type Strategy = 'fixed' | 'martingale' | 'dalembert' | 'oscar' | 'reverse' | '1326';
export type Preset = { id: string; name: string; description: string; risk: 'Low' | 'Medium' | 'High'; strategy: Strategy; contract: string; barrier: number; base: string; multiplier: string; takeProfit: string; stopLoss: string; maxRuns: string; autoScan: boolean; trigger: Trigger };
export type Trigger = { kind: 'none' | 'even' | 'odd' | 'high' | 'low' | 'repeat'; count: number };

export const PRESETS: Preset[] = [
  { id: 'safe-martingale', name: 'Safe Martingale', description: 'Even/Odd, 1.5× recovery, tight stop', risk: 'Medium', strategy: 'martingale', contract: 'EVEN', barrier: 0, base: '0.5', multiplier: '1.5', takeProfit: '10', stopLoss: '20', maxRuns: '40', autoScan: true, trigger: { kind: 'none', count: 3 } },
  { id: 'streak-hunter', name: 'Even/Odd Streak Hunter', description: 'Waits for 3 Evens in a row, then buys Odd', risk: 'Low', strategy: 'fixed', contract: 'ODD', barrier: 0, base: '1', multiplier: '2', takeProfit: '15', stopLoss: '15', maxRuns: '30', autoScan: false, trigger: { kind: 'even', count: 3 } },
  { id: 'differs-scalper', name: 'Differs Scalper', description: 'Differs on the rarest digit, steady stake', risk: 'Low', strategy: 'dalembert', contract: 'DIFFERS', barrier: 5, base: '2', multiplier: '2', takeProfit: '8', stopLoss: '30', maxRuns: '60', autoScan: true, trigger: { kind: 'none', count: 3 } },
  { id: 'over-under-trend', name: 'Over/Under Trend', description: 'After 4 low digits, buys Over 4', risk: 'Medium', strategy: 'martingale', contract: 'OVER', barrier: 4, base: '1', multiplier: '2', takeProfit: '20', stopLoss: '40', maxRuns: '50', autoScan: false, trigger: { kind: 'low', count: 4 } },
  { id: 'martingale', name: 'Martingale', description: 'Doubles the stake after a loss to recover', risk: 'High', strategy: 'martingale', contract: 'EVEN', barrier: 0, base: '0.35', multiplier: '2', takeProfit: '10', stopLoss: '25', maxRuns: '40', autoScan: false, trigger: { kind: 'none', count: 3 } },
  { id: 'dalembert', name: 'D’Alembert', description: 'Adds one unit after a loss, removes one after a win', risk: 'Medium', strategy: 'dalembert', contract: 'ODD', barrier: 0, base: '1', multiplier: '2', takeProfit: '15', stopLoss: '30', maxRuns: '50', autoScan: false, trigger: { kind: 'none', count: 3 } },
  { id: 'oscar', name: 'Oscar’s Grind', description: 'Raises stake after wins to lock one unit of profit', risk: 'Low', strategy: 'oscar', contract: 'UNDER', barrier: 7, base: '1', multiplier: '2', takeProfit: '10', stopLoss: '20', maxRuns: '50', autoScan: false, trigger: { kind: 'none', count: 3 } },
  { id: 'reverse', name: 'Reverse Martingale', description: 'Doubles after a win, resets after a loss', risk: 'High', strategy: 'reverse', contract: 'RISE', barrier: 0, base: '1', multiplier: '2', takeProfit: '20', stopLoss: '15', maxRuns: '30', autoScan: false, trigger: { kind: 'none', count: 3 } },
  { id: '1326', name: '1-3-2-6', description: 'Four-step win sequence, resets on any loss', risk: 'Medium', strategy: '1326', contract: 'DIFFERS', barrier: 3, base: '1', multiplier: '2', takeProfit: '15', stopLoss: '20', maxRuns: '40', autoScan: true, trigger: { kind: 'none', count: 3 } },
  { id: 'repeat-hunter', name: 'Digit Repeat Hunter', description: 'Waits for a digit to repeat twice, then buys Differs', risk: 'Low', strategy: 'fixed', contract: 'DIFFERS', barrier: 0, base: '2', multiplier: '2', takeProfit: '12', stopLoss: '20', maxRuns: '40', autoScan: false, trigger: { kind: 'repeat', count: 2 } },
];

/** True when the last `count` digits all match the trigger condition (or no trigger is set). */
export function triggerMet(digits: number[], t: Trigger): boolean {
  if (t.kind === 'none') return true;
  if (t.count < 1 || digits.length < t.count) return false;
  if (t.kind === 'repeat') { const last = digits.slice(-t.count); return last.every(d => d === last[0]); }
  const test = (d: number) => t.kind === 'even' ? d % 2 === 0 : t.kind === 'odd' ? d % 2 === 1 : t.kind === 'high' ? d >= 5 : d <= 4;
  return digits.slice(-t.count).every(test);
}

export function tradeStats(rows: { won: boolean; profit: number; stake: number }[]) {
  const wins = rows.filter(r => r.won).length;
  const grossWin = rows.filter(r => r.profit > 0).reduce((s, r) => s + r.profit, 0);
  const grossLoss = -rows.filter(r => r.profit < 0).reduce((s, r) => s + r.profit, 0);
  let best = 0, cur = 0;
  // rows are newest-first; streak order doesn't matter for the maximum.
  for (const r of rows) { cur = r.won ? cur + 1 : 0; best = Math.max(best, cur); }
  return {
    total: rows.length,
    wins,
    winRate: rows.length ? Math.round((wins / rows.length) * 100) : 0,
    net: Math.round(rows.reduce((s, r) => s + r.profit, 0) * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
    bestStreak: best,
    volume: Math.round(rows.reduce((s, r) => s + r.stake, 0) * 100) / 100,
  };
}
