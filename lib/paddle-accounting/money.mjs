// All calculations use integer minor units. Never reconstruct Paddle's fee.
export function minor(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid minor amount');
  if (!/^-?\d+$/.test(String(value ?? ''))) throw new Error('Missing or invalid minor amount');
  const n = BigInt(value);
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds safe range');
  return Number(n);
}

export function major(value) {
  const n = minor(value), sign = n < 0 ? '-' : '';
  return `${sign}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`;
}

export function bps(value) {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Invalid percentage');
  const [whole, fraction = ''] = text.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (n > 10000) throw new Error('Percentage exceeds 100');
  return n;
}

export function percent(amount, basisPoints) {
  const n = BigInt(minor(amount)), rate = BigInt(minor(basisPoints));
  if (rate < 0n || rate > 10000n) throw new Error('Invalid rate');
  const sign = n < 0n ? -1n : 1n;
  return Number(sign * ((n * sign * rate + 5000n) / 10000n));
}

// Largest remainder, with stable line-id tie breaking. Signed totals supported.
export function allocate(total, lines) {
  const value = minor(total), sign = value < 0 ? -1 : 1;
  if (!lines.length) { if (value) throw new Error('No allocation recipients'); return []; }
  const weights = lines.map(l => BigInt(minor(l.weight)));
  if (weights.some(w => w < 0n)) throw new Error('Negative allocation weight');
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (!sum && value) throw new Error('Zero allocation basis');
  if (!sum) return lines.map(() => 0);
  const numerators = weights.map(w => w * BigInt(Math.abs(value)));
  const result = numerators.map(n => Number(n / sum));
  const order = lines.map((l, i) => ({ i, id: String(l.id), rest: numerators[i] % sum }))
    .sort((a, b) => a.rest === b.rest ? a.id.localeCompare(b.id) : a.rest > b.rest ? -1 : 1);
  let left = Math.abs(value) - result.reduce((a, b) => a + b, 0);
  for (const row of order) { if (!left--) break; result[row.i]++; }
  return result.map(n => n * sign);
}

// Snapshot of the existing commercial conditions; platform is the residual,
// including referral costs. Referrals are separate from author/co-author earn.
export function split(net, rule) {
  net = minor(net);
  const result = {};
  const add = (role, user, amount) => { result[`${role}:${user}`] = amount; };
  if (net <= 0) { add('platform', 0, net); return result; }
  if (rule.kind === 'platform') { add('platform', 0, net); return result; }
  if (rule.kind === 'subscription') {
    add('author', rule.authorId, percent(net, rule.authorBps ?? 4500));
    add('site_fee', 0, percent(net, rule.siteBps ?? 1000));
  } else {
    const authorPool = net - percent(net, rule.siteBps);
    const co = rule.coAuthorId ? percent(authorPool, rule.coBps) : 0;
    add('author', rule.authorId, authorPool - co);
    if (rule.coAuthorId) add('coauthor', rule.coAuthorId, co);
    if (rule.refAuthorId) {
      const referral = percent(net, rule.refBps);
      if (rule.coAuthorId && (rule.refAuthorId === rule.authorId || rule.refAuthorId === rule.coAuthorId)) {
        const coRef = percent(referral, rule.coBps);
        add('referral', rule.authorId, referral - coRef);
        add('referral', rule.coAuthorId, coRef);
      } else add('referral', rule.refAuthorId, referral);
    }
  }
  const paid = Object.values(result).reduce((a, b) => a + b, 0);
  add('platform', 0, net - paid);
  return result;
}

export function diff(previous, next) {
  return Object.fromEntries([...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .map(k => [k, (next[k] ?? 0) - (previous[k] ?? 0)]));
}

export function moneyFromPaddle(txn) {
  const p = txn.details?.payout_totals;
  if (txn.status !== 'completed' || !p || p.fee == null || p.earnings == null) throw new Error('Awaiting final Paddle totals');
  // Existing user balances and marketplace cabinets are USD. Other transaction
  // currencies work through Paddle's USD payout amounts; never mix balances.
  if (p.currency_code !== 'USD') throw new Error('Payout currency requires a separate balance');
  const lines = txn.details?.line_items;
  if (!Array.isArray(lines) || !lines.length || lines.some(l => !l.id)) throw new Error('Awaiting complete line items');
  if (new Set(lines.map(l => l.id)).size !== lines.length) throw new Error('Duplicate Paddle line id');
  const bases = lines.map(l => ({ id: l.id, weight: minor(l.totals?.total) }));
  const preTax = lines.map(l => minor(l.totals?.subtotal) - minor(l.totals?.discount));
  if (preTax.some(n => n < 0)) throw new Error('Negative line requires review');
  const transactionTotals = txn.details?.totals;
  if (preTax.reduce((a, b) => a + b, 0) !== minor(transactionTotals.subtotal) - minor(transactionTotals.discount)) throw new Error('Line totals do not reconcile');
  const fee = minor(p.fee), net = minor(p.earnings);
  if (fee < 0 || net < 0) throw new Error('Negative payment requires review');
  const fees = allocate(fee, bases);
  // Allocate converted pre-tax revenue first, then the actual fee (which is
  // charged on tax-inclusive totals). Both totals reconcile to Paddle exactly.
  const revenues = allocate(net + fee, lines.map((l, i) => ({ id: l.id, weight: preTax[i] })));
  return lines.map((l, i) => ({ id: l.id, fee: fees[i], net: revenues[i] - fees[i], revenue: revenues[i] }));
}

export function moneyFromAdjustment(adj) {
  const p = adj.payout_totals, items = adj.items ?? [];
  if (!p || p.currency_code !== 'USD' || p.fee == null || p.earnings == null || p.retained_fee == null) throw new Error('Awaiting final adjustment payout totals');
  if (!items.length || new Set(items.map(i => i.item_id)).size !== items.length) throw new Error('Missing or duplicate adjustment line');
  const fee = minor(p.fee), retained = minor(p.retained_fee), revenue = minor(p.earnings) + fee;
  if (fee < 0 || retained < 0 || revenue < 0) throw new Error('Adjustment sign requires review');
  const beforeTax = items.map(i => ({ id: i.item_id, weight: minor(i.totals?.subtotal) }));
  const totals = items.map(i => ({ id: i.item_id, weight: minor(i.totals?.total ?? (minor(i.totals?.subtotal) + minor(i.totals?.tax))) }));
  const revenues = allocate(revenue,beforeTax), fees = allocate(fee,totals), retainedFees = allocate(retained,totals);
  // A tax-only item has zero revenue and a returned fee: its earnings delta
  // must be positive even inside an adjustment which also refunds other items.
  return items.map((item,i)=>({ id:item.item_id, earnings:revenues[i]-fees[i], retained:retainedFees[i] }));
}
