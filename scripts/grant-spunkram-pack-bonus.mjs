/**
 * One-off, audited +10 Spunkram generations for owners of any selected paid pack.
 * Preview: node --env-file=.env scripts/grant-spunkram-pack-bonus.mjs --pack-ids=3,8
 * Apply: append --apply --admin-user-id=<the administrator's user ID>.
 * Run from the active production release; never auto-run during deployment.
 */
import mysql from "mysql2/promise";
import { soldItemAccessCondition } from "../lib/campaigns/core.mjs";

const authorId = 1691, amount = 10;
const requestId = "b9c17280-6092-4f26-8663-292aeb0c2906";
const args = process.argv.slice(2);
const packArg = args.find(value => value.startsWith("--pack-ids="))?.slice("--pack-ids=".length) ?? "";
if (!/^[1-9]\d*(?:,[1-9]\d*)*$/.test(packArg)) throw new Error("Specify --pack-ids with confirmed catalog pack IDs");
const packIds = [...new Set(packArg.split(",").map(Number))].sort((a, b) => a - b);
const apply = args.includes("--apply");
const adminUserId = Number(args.find(value => value.startsWith("--admin-user-id="))?.split("=")[1]);
if (apply && (!Number.isSafeInteger(adminUserId) || adminUserId < 1)) throw new Error("Specify the administrator's --admin-user-id");
const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  connectTimeout: 15000 });
let locked = false;
try {
  const [packs] = await db.execute(`SELECT id, name, host FROM packages_projects
    WHERE author_id = ? AND id IN (${packIds.map(() => "?").join(",")})
      AND deleted_at IS NULL AND COALESCE(admin_only, 0) = 0 AND price > 0`, [authorId, ...packIds]);
  if (packs.length !== packIds.length) throw new Error("A selected pack is not a paid Spunkram pack");
  const recipientSql = `SELECT DISTINCT u.id AS user_id FROM users u JOIN sold_items si ON si.buyer_id = u.id
    JOIN packages_projects pp ON pp.author_id = si.author_id
      AND (si.item_id = pp.id OR si.item_id = pp.marketplace_item_id)
    WHERE si.author_id = ? AND pp.id IN (${packIds.map(() => "?").join(",")})
      AND ${soldItemAccessCondition("si")}`;
  const [totals] = await db.execute(`SELECT COUNT(*) AS eligible,
    SUM(EXISTS (SELECT 1 FROM user_generation_credit_audit a WHERE a.user_id = targets.user_id
      AND a.author_id = ? AND a.action = 'admin_add_extra'
      AND JSON_UNQUOTE(JSON_EXTRACT(a.payload, '$.requestId')) = ?)) AS already_granted
    FROM (${recipientSql}) targets`, [authorId, requestId, authorId, ...packIds]);
  console.log(JSON.stringify({ campaign: requestId, amount, packs, ...totals[0], apply }));
  if (!apply) process.exitCode = 0;
  else {
    const emails = (process.env.PACKAGES_ADMIN_EMAILS || "basepackagehelp@gmail.com").split(/[,;\s]+/).map(value => value.toLowerCase());
    const [admins] = await db.execute("SELECT email FROM users WHERE id = ?", [adminUserId]);
    if (!admins.length || !emails.includes(String(admins[0].email).toLowerCase())) throw new Error("The actor must be a packages administrator");
    const [[lease]] = await db.execute("SELECT GET_LOCK('spunkram-pack-bonus-2026-11-06', 15) AS acquired");
    if (Number(lease.acquired) !== 1) throw new Error("Another bonus operation is running");
    locked = true;
    await db.execute("SET @account_audit_actor_id = ?, @account_audit_source = 'admin.credits'", [adminUserId]);
    await db.query("CREATE TEMPORARY TABLE spunkram_bonus_targets (user_id BIGINT UNSIGNED PRIMARY KEY, before_balance INT NOT NULL DEFAULT 0)");
    await db.beginTransaction();
    try {
      await db.execute(`INSERT INTO spunkram_bonus_targets (user_id)
        SELECT targets.user_id FROM (${recipientSql}) targets WHERE NOT EXISTS (
          SELECT 1 FROM user_generation_credit_audit a WHERE a.user_id = targets.user_id AND a.author_id = ?
          AND a.action = 'admin_add_extra' AND JSON_UNQUOTE(JSON_EXTRACT(a.payload, '$.requestId')) = ?)
        ORDER BY targets.user_id`, [authorId, ...packIds, authorId, requestId]);
      await db.execute(`INSERT INTO user_generation_credits (user_id, author_id, extra_balance)
        SELECT user_id, ?, 0 FROM spunkram_bonus_targets ORDER BY user_id
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`, [authorId]);
      await db.execute(`UPDATE spunkram_bonus_targets t JOIN user_generation_credits c ON c.user_id = t.user_id AND c.author_id = ?
        SET t.before_balance = c.extra_balance`, [authorId]);
      const [[overflow]] = await db.query(`SELECT COUNT(*) AS count FROM spunkram_bonus_targets WHERE before_balance > ${2147483647 - amount}`);
      if (Number(overflow.count)) throw new Error("A recipient balance would overflow; no grants applied");
      await db.execute(`UPDATE user_generation_credits c JOIN spunkram_bonus_targets t ON t.user_id = c.user_id
        SET c.extra_balance = c.extra_balance + ? WHERE c.author_id = ?`, [amount, authorId]);
      const [audit] = await db.execute(`INSERT INTO user_generation_credit_audit (user_id, author_id, action, payload, note)
        SELECT user_id, ?, 'admin_add_extra', JSON_OBJECT('requestId', ?, 'adminUserId', ?, 'amount', ?,
          'before', before_balance, 'after', before_balance + ?, 'packIds', ?),
          'One-off Spunkram AE/PR pack-owner bonus: +10 per user, once'
        FROM spunkram_bonus_targets ORDER BY user_id`, [authorId, requestId, adminUserId, amount, amount, packIds.join(",")]);
      await db.commit();
      console.log(JSON.stringify({ committed: true, grantedUsers: audit.affectedRows,
        grantedGenerations: audit.affectedRows * amount, authorId, requestId }));
    } catch (error) { await db.rollback(); throw error; }
  }
} finally {
  if (locked) await db.query("SELECT RELEASE_LOCK('spunkram-pack-bonus-2026-11-06')").catch(() => {});
  await db.end();
}
