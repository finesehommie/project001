// Simulated NOWPayments-style crypto checkout. No real provider is called and
// no funds move: a deposit request is recorded as pending for admin review.
export const CRYPTO_COINS = [
  { id: 'USDTTRC20', label: 'USDT (TRC20)', rate: 1, prefix: 'T' },
  { id: 'BTC', label: 'Bitcoin (BTC)', rate: 1 / 68000, prefix: 'bc1q' },
  { id: 'ETH', label: 'Ethereum (ETH)', rate: 1 / 3400, prefix: '0x' },
  { id: 'LTC', label: 'Litecoin (LTC)', rate: 1 / 85, prefix: 'ltc1q' },
] as const;
export type CoinId = (typeof CRYPTO_COINS)[number]['id'];

const ALPHA = 'abcdefghijkmnpqrstuvwxyz023456789';
export function simulatedInvoice(coin: CoinId, usd: number, seed = Date.now()) {
  const c = CRYPTO_COINS.find(x => x.id === coin) ?? CRYPTO_COINS[0];
  let s = seed % 2147483647, addr = '';
  for (let i = 0; i < 32; i++) { s = (s * 48271) % 2147483647; addr += ALPHA[s % ALPHA.length]; }
  const amount = usd * c.rate;
  return {
    paymentId: `NP-SIM-${seed.toString(36).toUpperCase()}`,
    coin: c,
    address: c.prefix + (c.prefix === '0x' ? addr.replace(/[^0-9a-f]/g, 'a').slice(0, 40).padEnd(40, 'f') : addr),
    payAmount: c.rate === 1 ? amount.toFixed(2) : amount.toFixed(8),
    expiresAt: seed + 20 * 60 * 1000,
  };
}
