import crypto from 'node:crypto';
import { allocate, bps, diff, major, minor, moneyFromAdjustment, moneyFromPaddle, split } from './money.mjs';

const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const date = value => {
  if (!value) throw new Error('Missing Paddle creation date');
  const raw = typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error('Missing Paddle creation date');
  const fraction = typeof raw === 'string' ? raw.match(/\.(\d+)Z$/)?.[1] : null;
  return d.toISOString().slice(0, 19).replace('T', ' ') + '.' + (fraction ?? d.toISOString().slice(20, 23)).padEnd(6, '0').slice(0, 6);
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

/** One financial writer for Next.js and the authenticated Laravel bridge.
 * getConnection is injected to allow real MySQL TEMPORARY-table integration tests.
 */
export function createAccounting({ getConnection, catalog, marketTable = 'marketplace_items' }) {
  if (!/^[a-zA-Z0-9_]+$/.test(marketTable)) throw new Error('Invalid marketplace table');
  const rows = async (c, sql, params = []) => (await c.execute(sql, params))[0];
  const scopeKey = s => [s.account, s.environment];
  async function utcConnection() {
    const c = await getConnection();
    let original;
    try {
      original = (await rows(c, 'SELECT @@session.time_zone AS zone'))[0].zone;
      await rows(c, "SET time_zone='+00:00'");
    } catch (error) { c.release(); throw error; }
    return { c, release: async () => {
      try { await rows(c, 'SET time_zone=?', [original]); c.release(); }
      catch { if (c.destroy) c.destroy(); else c.release(); }
    } };
  }

  async function classify(c, txn) {
    const config = catalog();
    const cd = txn.custom_data ?? {};
    const suppliedLines = txn.details?.line_items ?? [];
    const lines = suppliedLines.length ? suppliedLines : (txn.items?.length ? txn.items.map(item => ({ id: null, price_id: item.price?.id })) : [{ id: null }]);
    let existingAuthor = null;
    if (txn.subscription_id) {
      const found = await rows(c, 'SELECT author_id, buyer_id, plan FROM subscription_systems WHERE subscription_id = ? LIMIT 1', [txn.subscription_id]);
      existingAuthor = found[0] ?? null;
    }
    const buyerId = id(cd.buyer_id ?? cd.userId) ?? id(existingAuthor?.buyer_id);
    const plans = [];
    let excluded = 0, unknown = 0;
    for (const line of lines) {
      const item = txn.items?.find(i => i.price?.id === line.price_id)
        ?? (lines.length === 1 && txn.items?.length === 1 ? txn.items[0] : null);
      const priceId = line.price_id ?? item?.price?.id;
      if (config.corePriceIds.includes(priceId)) { excluded++; continue; }
      const product = line.product?.custom_data ?? {};
      const productItem = id(product.item_id ?? product.marketplace_item_id);
      // Transaction-level single-item metadata must not be applied to every
      // position in an order. Multi-line orders require per-product metadata.
      const itemId = productItem ?? (lines.length === 1 ? id(cd.item_id ?? cd.itemId) : null);
      if (itemId) {
        const market = (await rows(c, `SELECT id, author_id, team FROM \`${marketTable}\` WHERE id = ?`, [itemId]))[0];
        if (!market) throw new Error(`Marketplace item missing: ${itemId}`);
        const authorId = id(market.author_id);
        if (!authorId) throw new Error('Missing item author');
        const user = (await rows(c, 'SELECT extra_tax FROM users WHERE id = ?', [authorId]))[0];
        if (!user) throw new Error('Missing author');
        const licenseRaw = item?.price?.custom_data?.license ?? cd.item_licenses?.[itemId] ?? cd.license ?? 1;
        const license = /commercial|extended/i.test(String(licenseRaw)) ? 2 : id(licenseRaw) ?? 1;
        const extra = user.extra_tax != null && Number(user.extra_tax) > 0 ? bps(user.extra_tax) : null;
        const team = market.team ? json(market.team) : null;
        const rule = {
          kind: 'sale', authorId, itemId, license, quantity: id(line.quantity) ?? 1,
          siteBps: extra ?? (license === 1 ? 3000 : 2500),
          coAuthorId: id(team?.co_author_id), coBps: team ? bps(team.percent) : 0,
          refAuthorId: id(cd.ref_author_id), refLinkId: id(cd.ref_link_id), refBps: extra ? 500 : 1000,
        };
        plans.push({ lineId: line.id, rule });
        continue;
      }
      const mapped = config.authorPrices[priceId];
      const authorId = id(mapped?.authorId) ?? (Number(product.subs_system) === 1 ? id(product.author_id) : null)
        ?? id(existingAuthor?.author_id)
        ?? (cd.kind === 'spunkram_subscription' ? id(cd.author_id) : null);
      if (authorId) {
        const interval = item?.price?.billing_cycle?.interval;
        plans.push({ lineId: line.id, rule: { kind: 'subscription', authorId,
          authorBps: 4500, siteBps: 1000,
          plan: mapped?.plan ?? (interval === 'month' ? 'monthly' : interval === 'year' ? 'annual' : existingAuthor?.plan ?? 'lifetime'),
          quantity: id(line.quantity) ?? 1, priceId: priceId ?? null,
          productId: line.product?.id ?? item?.price?.product_id ?? null,
          productName: line.product?.name ?? item?.price?.name ?? null } });
      } else if (cd.kind === 'extra_ai_generations' || config.extraPriceIds?.includes(priceId)) {
        plans.push({ lineId: line.id, rule: { kind: 'platform', authorId: 0 } });
      } else if (cd.plan === 'creator' || cd.plan === 'creator_ai' || existingAuthor?.author_id === 0 || existingAuthor?.author_id == null && txn.subscription_id) {
        excluded++;
      } else unknown++;
    }
    if (!plans.length && unknown && !excluded) {
      return { buyerId, plans: lines.map(line => ({ lineId: line.id, rule: { kind: 'platform', authorId: id(line.product?.custom_data?.author_id) ?? 0 } })),
        blocked: 'Unknown product attribution', provisional: lines.some(l => !l.id), passthrough: false };
    }
    if (!plans.length) return null;
    return { buyerId, plans, blocked: excluded || unknown ? 'Mixed or unknown product attribution' : null,
      provisional: lines.some(l => !l.id),
      passthrough: plans.every(p => p.rule.kind === 'platform') };
  }

  async function owned(c, txn, source) {
    let settings;
    try {
      settings = (await rows(c, "SELECT DATE_FORMAT(enabled_from,'%Y-%m-%d %H:%i:%s.%f') AS enabled_from,accept_new FROM paddle_accounting_settings WHERE id = 1"))[0];
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return null; // Deployment before additive migration.
      throw error;
    }
    const existing = (await rows(c, 'SELECT * FROM paddle_accounting_transactions WHERE account = ? AND environment = ? AND transaction_id = ?', [...scopeKey(source), txn.id]))[0];
    if (existing) return { existing, scope: json(existing.scope_snapshot) };
    if (!settings?.enabled_from || !settings.accept_new) return null;
    const created = date(txn.created_at);
    const cutoff = typeof settings.enabled_from === 'string' ? settings.enabled_from.replace('T', ' ').replace('Z', '') : date(settings.enabled_from);
    if (created < cutoff.slice(0, 26)) return null;
    const scope = await classify(c, txn);
    return scope ? { existing: null, scope } : null;
  }

  async function movement(c, lineRowId, changes, sourceId, adjustmentId = null) {
    // Stable lock order across unrelated sales to the same beneficiaries.
    for (const [key, amount] of Object.entries(changes).sort((a, b) => Number(a[0].split(':')[1]) - Number(b[0].split(':')[1]) || a[0].localeCompare(b[0]))) {
      if (!amount) continue;
      const [role, user] = key.split(':');
      const result = await rows(c, `INSERT IGNORE INTO paddle_accounting_movements
        (entry_key, line_row_id, adjustment_id, user_id, role, amount_minor, currency_code)
        VALUES (?, ?, ?, ?, ?, ?, 'USD')`, [hash(`${lineRowId}:${sourceId}:${key}`), lineRowId, adjustmentId, Number(user), role, amount]);
      if (result.affectedRows && Number(user) > 0) {
        const updated = await rows(c, 'UPDATE users SET balance = balance + ? WHERE id = ?', [major(amount), Number(user)]);
        if (!updated.affectedRows) throw new Error('Beneficiary no longer exists');
      }
    }
  }

  async function project(c, tx, txn, line, rule, amounts, breakdown) {
    const paymentId = `${txn.id}-${line.id}`;
    const method = txn.payments?.find(p => p.status === 'captured')?.method_details;
    const args = JSON.stringify({ accounting_version: 2, accounting_transaction_id: tx.id, method: method?.card?.type ?? method?.type ?? '', last_signs: method?.card?.last4 ?? null });
    const author = breakdown[`author:${rule.authorId}`] ?? 0;
    const co = breakdown[`coauthor:${rule.coAuthorId}`] ?? 0;
    const ref = rule.refAuthorId ? breakdown[`referral:${rule.refAuthorId}`] ?? 0 : 0;
    const coRef = rule.coAuthorId && rule.refAuthorId === rule.authorId ? breakdown[`referral:${rule.coAuthorId}`] ?? 0
      : rule.coAuthorId && rule.refAuthorId === rule.coAuthorId ? breakdown[`referral:${rule.authorId}`] ?? 0 : null;
    if (rule.kind === 'sale') {
      const existing = await rows(c, 'SELECT id FROM sold_items WHERE payment_id = ? LIMIT 1', [paymentId]);
      if (existing.length) throw new Error('A legacy writer already processed this payment; review required');
      const inserted = await rows(c, `INSERT INTO sold_items
        (buyer_id,author_id,item_id,status,payment_id,purchase_code,sold_price,sold_summary,sold_net,
         platform_earn,author_earn,license,qty,\`system\`,system_tax,arguments,co_author_id,co_percent,co_earn,
         ref_link_id,ref_author_id,ref_earn,co_ref_earn,created_at,updated_at)
        VALUES (?,?,?,1,?,?,?,?,?,?,?,?,?,'paddle',?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [tx.buyer_id, rule.authorId, rule.itemId, paymentId, crypto.createHash('md5').update(`order${rule.itemId}${tx.buyer_id}${paymentId}`).digest('hex'),
        major(Number((BigInt(amounts.revenue) * 2n + BigInt(rule.quantity)) / (2n * BigInt(rule.quantity)))), major(amounts.revenue), major(amounts.net), major(breakdown['platform:0'] ?? 0), major(author), rule.license, rule.quantity,
        major(amounts.fee), args, rule.coAuthorId, rule.coAuthorId ? rule.coBps / 100 : null, rule.coAuthorId ? major(co) : null,
        rule.refLinkId, rule.refAuthorId, rule.refAuthorId ? major(ref) : null, coRef == null ? null : major(coRef)]);
      return { soldId: inserted.insertId, paymentRowId: null, first: false };
    }
    if (rule.kind === 'platform') return { soldId: null, paymentRowId: null, first: false };
    const subscriptionId = txn.subscription_id ?? txn.id;
    const sideCharge = ['subscription_charge', 'subscription_update', 'subscription_cancellation'].includes(txn.origin);
    if (!sideCharge && rule.plan !== 'lifetime' && (!txn.subscription_id || !txn.billing_period?.ends_at)) throw new Error('Awaiting subscription billing period');
    // Access state is mutable; historical payment / adjustment records are not.
    const prior = (await rows(c, "SELECT *,DATE_FORMAT(paddle_billing_period_starts_at,'%Y-%m-%d %H:%i:%s') AS paddle_billing_period_starts_at FROM subscription_systems WHERE subscription_id = ? FOR UPDATE", [subscriptionId]))[0];
    const ends = txn.billing_period?.ends_at ? date(txn.billing_period.ends_at) : null;
    const start = txn.billing_period?.starts_at ? date(txn.billing_period.starts_at) : null;
    const newer = !sideCharge && (!prior || !prior.paddle_billing_period_starts_at || !start || date(prior.paddle_billing_period_starts_at) <= start);
    let subId = prior?.id ?? null;
    if (newer) {
      const result = await rows(c, `INSERT INTO subscription_systems
        (buyer_id,author_id,subscription_id,payment_id,status,amount,amount_summary,price,system_tax,\`system\`,type,plan,\`count\`,arguments,
         ends_at,paddle_product_id,paddle_price_id,paddle_product_name,paddle_billing_period_starts_at,paddle_billing_period_ends_at,
         author_earn,author_balance_credited_for_payment_id,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?,?,?,'paddle','personal',?,1,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE payment_id=VALUES(payment_id),status=1,amount=VALUES(amount),amount_summary=VALUES(amount_summary),
          price=VALUES(price),system_tax=VALUES(system_tax),author_id=VALUES(author_id),author_earn=VALUES(author_earn),arguments=VALUES(arguments),
          ends_at=VALUES(ends_at),paddle_product_id=VALUES(paddle_product_id),paddle_price_id=VALUES(paddle_price_id),
          paddle_product_name=VALUES(paddle_product_name),paddle_billing_period_starts_at=VALUES(paddle_billing_period_starts_at),
          paddle_billing_period_ends_at=VALUES(paddle_billing_period_ends_at),author_balance_credited_for_payment_id=VALUES(author_balance_credited_for_payment_id),updated_at=UTC_TIMESTAMP()`,
      [tx.buyer_id, rule.authorId, subscriptionId, txn.id, major(amounts.net), major(amounts.revenue), major(amounts.revenue), major(amounts.fee), rule.plan, args,
        ends, rule.productId, rule.priceId, rule.productName, start, ends, major(author), txn.id]);
      subId = prior?.id ?? result.insertId;
    }
    const oldPayment = await rows(c, 'SELECT id FROM subscription_payments WHERE payment_id IN (?,?) LIMIT 1', [txn.id, paymentId]);
    if (oldPayment.length) throw new Error('A legacy writer already recorded this charge; review required');
    const last = (await rows(c, 'SELECT MAX(period_number) AS period FROM subscription_payments WHERE subscription_id = ?', [subscriptionId]))[0];
    const period = Number(last?.period ?? 0) + (sideCharge ? 0 : 1);
    const discount = allocate(minor(txn.details.payout_totals.discount), txn.details.line_items.map(l => ({ id: l.id, weight: minor(l.totals.discount) })));
    const position = txn.details.line_items.findIndex(l => l.id === line.id);
    const result = await rows(c, `INSERT INTO subscription_payments
      (subscription_system_id,buyer_id,author_id,subscription_id,payment_id,plan,type,amount,amount_summary,author_earn,system_tax,discount,period_number,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'personal',?,?,?,?,?,?,?,UTC_TIMESTAMP())`,
    [subId, tx.buyer_id, rule.authorId, subscriptionId, paymentId, rule.plan, major(amounts.net), major(amounts.revenue), major(author), major(amounts.fee), major(discount[position]), period, date(txn.billed_at ?? txn.created_at)]);
    return { soldId: null, paymentRowId: result.insertId, first: period === 1 };
  }

  async function transaction(txn, source) {
    if (!['default', 'spunkram'].includes(source.account) || !['production', 'sandbox'].includes(source.environment)) throw new Error('Unknown Paddle source');
    const { c, release } = await utcConnection();
    let tx = null, locked = false;
    const lock = `pa2:${hash([...scopeKey(source), txn.id].join(':')).slice(0, 58)}`;
    try {
      const ownership = await owned(c, txn, source);
      if (!ownership) return { handled: false };
      const scope = ownership.scope;
      if ((await rows(c, 'SELECT GET_LOCK(?, 10) AS acquired', [lock]))[0]?.acquired !== 1) throw new Error('Accounting busy');
      locked = true;
      const participants = [...new Set(scope.plans.flatMap(p => [p.rule.authorId, p.rule.coAuthorId, p.rule.refAuthorId]).filter(Boolean))];
      await rows(c, `INSERT IGNORE INTO paddle_accounting_transactions
        (account,environment,transaction_id,subscription_id,buyer_id,paddle_created_at,currency_code,source_payload,scope_snapshot,participants)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [...scopeKey(source), txn.id, txn.subscription_id ?? null, scope.buyerId, date(txn.created_at), txn.currency_code ?? null, JSON.stringify(txn), JSON.stringify(scope), JSON.stringify(participants)]);
      await c.beginTransaction();
      tx = (await rows(c, 'SELECT * FROM paddle_accounting_transactions WHERE account = ? AND environment = ? AND transaction_id = ? FOR UPDATE', [...scopeKey(source), txn.id]))[0];
      let frozen = json(tx.scope_snapshot);
      if (tx.status === 'applied') { await c.commit(); return { handled: true, buyerId: tx.buyer_id, passthrough: frozen.passthrough, status: 'applied', fresh: false }; }
      if (frozen.blocked || frozen.provisional || !tx.buyer_id) {
        const resolved = await classify(c, txn);
        if (resolved && !resolved.blocked && !resolved.provisional && resolved.buyerId) {
          frozen = resolved;
          tx.buyer_id = resolved.buyerId;
          await rows(c, 'UPDATE paddle_accounting_transactions SET scope_snapshot=?,buyer_id=?,participants=? WHERE id=?',
            [JSON.stringify(frozen), tx.buyer_id, JSON.stringify([...new Set(frozen.plans.flatMap(p => [p.rule.authorId,p.rule.coAuthorId,p.rule.refAuthorId]).filter(Boolean))]),tx.id]);
        }
      }
      if (frozen.blocked) throw new Error(frozen.blocked);
      if (frozen.provisional) throw new Error('Awaiting final line identities');
      if (!tx.buyer_id) throw new Error('Awaiting buyer attribution');
      // Existing balances are production USD only. Sandbox never changes them.
      if (source.environment !== 'production') throw new Error('Sandbox accounting is isolated from real balances');
      const money = moneyFromPaddle(txn);
      if (money.length !== frozen.plans.length) throw new Error('Awaiting complete product attribution');
      const subscriptionLines = frozen.plans.filter(p => p.rule.kind === 'subscription');
      if (subscriptionLines.length > 1) throw new Error('Multi-product subscription access requires review');
      const legacySub = txn.subscription_id ? (await rows(c, 'SELECT payment_id FROM subscription_systems WHERE subscription_id = ?', [txn.subscription_id]))[0] : null;
      if (legacySub?.payment_id === txn.id) throw new Error('A legacy writer already credited this charge; review required');
      let first = false;
      for (const plan of frozen.plans) {
        const amount = money.find(m => m.id === plan.lineId);
        const line = txn.details.line_items.find(l => l.id === plan.lineId);
        if (!amount || !line) throw new Error('Line identity changed');
        const breakdown = split(amount.net, plan.rule);
        const projected = await project(c, tx, txn, line, plan.rule, amount, breakdown);
        first ||= projected.first;
        const inserted = await rows(c, `INSERT INTO paddle_accounting_lines
          (transaction_row_id,line_id,kind,author_id,item_id,legacy_payment_id,rule_snapshot,breakdown,revenue_minor,fee_minor,
           original_net_minor,current_net_minor,sold_item_id,subscription_payment_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tx.id, line.id, plan.rule.kind, plan.rule.authorId, plan.rule.itemId ?? null, `${txn.id}-${line.id}`, JSON.stringify(plan.rule), JSON.stringify(breakdown), amount.revenue, amount.fee, amount.net, amount.net, projected.soldId, projected.paymentRowId]);
        await movement(c, inserted.insertId, breakdown, 'payment');
      }
      await rows(c, `UPDATE paddle_accounting_transactions SET status='applied',reason=NULL,completed_payload=?,
        payout_currency_code=?,fee_minor=?,earnings_minor=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?`,
      [JSON.stringify(txn), txn.details.payout_totals.currency_code, minor(txn.details.payout_totals.fee), minor(txn.details.payout_totals.earnings), tx.id]);
      await c.commit();
      return { handled: true, status: 'applied', fresh: true, first, buyerId: tx.buyer_id, passthrough: frozen.passthrough,
        notification: subscriptionLines.length ? { ...subscriptionLines[0].rule, amountSummary: Number(txn.details.payout_totals.subtotal) / 100 } : null };
    } catch (error) {
      try { await c.rollback(); } catch { /* connection may have failed */ }
      if (!tx) throw error;
      // Keep the original input and frozen terms; retry hydrates final Paddle
      // data instead of ever falling back to the estimated fee writer.
      await rows(c, "UPDATE paddle_accounting_transactions SET reason=?,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='pending'", [String(error.message).slice(0, 255), tx.id]);
      return { handled: true, status: 'pending', reason: error.message, buyerId: tx.buyer_id };
    } finally {
      if (locked) await rows(c, 'SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
      await release();
    }
  }

  async function adjustment(adj, txn, source) {
    const ownedTransaction = await transaction(txn, source);
    if (!ownedTransaction.handled) return { handled: false };
    const { c, release } = await utcConnection();
    let row = null;
    try {
      await rows(c, `INSERT INTO paddle_accounting_adjustments
        (account,environment,adjustment_id,transaction_id,source_payload) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE source_payload=VALUES(source_payload),updated_at=UTC_TIMESTAMP(6)`,
      [...scopeKey(source), adj.id, adj.transaction_id, JSON.stringify(adj)]);
      await c.beginTransaction();
      // Same order for every adjustment: transaction, then adjustment, then lines.
      const tx = (await rows(c, 'SELECT * FROM paddle_accounting_transactions WHERE account=? AND environment=? AND transaction_id=? FOR UPDATE', [...scopeKey(source), adj.transaction_id]))[0];
      row = (await rows(c, 'SELECT * FROM paddle_accounting_adjustments WHERE account=? AND environment=? AND adjustment_id=? FOR UPDATE', [...scopeKey(source), adj.id]))[0];
      if (row.status === 'applied') { await c.commit(); return { handled: true, status: 'applied' }; }
      if (tx.status !== 'applied') throw new Error('Awaiting original payment settlement');
      if (adj.status !== 'approved') {
        await rows(c, 'UPDATE paddle_accounting_adjustments SET status=?,reason=NULL WHERE id=?', [adj.status === 'rejected' ? 'rejected' : 'pending', row.id]);
        await c.commit(); return { handled: true, status: adj.status };
      }
      if (adj.action !== 'refund') throw new Error('Non-refund adjustment requires reconciliation review');
      const amounts = moneyFromAdjustment(adj);
      const lines = await rows(c, 'SELECT * FROM paddle_accounting_lines WHERE transaction_row_id=? ORDER BY id FOR UPDATE', [tx.id]);
      const items = adj.items ?? [];
      if (!items.length || items.some(i => !lines.some(l => l.line_id === i.item_id))) throw new Error('Unknown adjustment line');
      for (let i = 0; i < items.length; i++) {
        const line = lines.find(l => l.line_id === items[i].item_id);
        const rule = json(line.rule_snapshot), previous = json(line.breakdown);
        const net = Number(line.current_net_minor) - amounts[i].earnings;
        if (net < 0 && items[i].type !== 'tax') throw new Error('Refund exceeds remaining payment earnings');
        const next = split(net, rule);
        const retainedTotal = Number(line.retained_fee_minor) + amounts[i].retained;
        // Existing marketplace policy: retained payment fees are a site cost;
        // an author never repays more than their original commercial share.
        next['platform:0'] = (next['platform:0'] ?? 0) - retainedTotal;
        await movement(c, line.id, diff(previous, next), `refund:${adj.id}`, adj.id);
        await rows(c, 'UPDATE paddle_accounting_lines SET current_net_minor=?,retained_fee_minor=?,breakdown=? WHERE id=?', [net, retainedTotal, JSON.stringify(next), line.id]);
        const main = next[`author:${rule.authorId}`] ?? 0;
        const co = next[`coauthor:${rule.coAuthorId}`] ?? 0;
        if (line.sold_item_id) {
          await rows(c, `UPDATE sold_items SET author_earn=?,co_earn=?,ref_earn=?,co_ref_earn=?,platform_earn=?,sold_net=?,status=IF(?=0,0,status),updated_at=UTC_TIMESTAMP() WHERE id=?`,
          [major(main), rule.coAuthorId ? major(co) : null, rule.refAuthorId ? major(next[`referral:${rule.refAuthorId}`] ?? 0) : null,
            rule.coAuthorId && rule.refAuthorId ? major(next[`referral:${rule.refAuthorId === rule.authorId ? rule.coAuthorId : rule.authorId}`] ?? 0) : null,
            major(next['platform:0'] ?? 0), major(net), items[i].type === 'tax' ? 1 : net, line.sold_item_id]);
        }
        if (line.subscription_payment_id) {
          // This is a compatibility projection. Immutable movements preserve
          // the original charge and every dated correction for both cabinets.
          await rows(c, 'UPDATE subscription_payments SET author_earn=?,amount=?,updated_at=UTC_TIMESTAMP() WHERE id=?', [major(main), major(net), line.subscription_payment_id]);
          await rows(c, `UPDATE subscription_systems SET author_earn=?,amount=?,status=IF(?=0,0,status),updated_at=UTC_TIMESTAMP()
            WHERE payment_id=? AND author_id=?`, [major(main), major(net), net, adj.transaction_id, rule.authorId]);
        }
      }
      await rows(c, "UPDATE paddle_accounting_adjustments SET status='applied',reason=NULL,applied_payload=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?", [JSON.stringify(adj), row.id]);
      await c.commit(); return { handled: true, status: 'applied' };
    } catch (error) {
      try { await c.rollback(); } catch { /* original failure retained below */ }
      if (!row) throw error;
      await rows(c, 'UPDATE paddle_accounting_adjustments SET reason=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?', [String(error.message).slice(0, 255), row.id]);
      return { handled: true, status: 'pending', reason: error.message };
    } finally { await release(); }
  }

  return { transaction, adjustment };
}
