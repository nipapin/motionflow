/** Integration test on disposable tables; never inserts or updates real users. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accountAuditSql, auditDbConnection, migrationStatements } from "./lib/account-audit-migration.mjs";

const prefix = `mf_audit_test_${randomBytes(6).toString("hex")}`;
const usersTable = `${prefix}_users`;
const auditTable = `${prefix}_audit`;
const conn = await auditDbConnection();
let usersCreated = false;
let auditCreated = false;
try {
  await conn.query(`CREATE TABLE \`${usersTable}\` LIKE users`);
  usersCreated = true;
  const sql = accountAuditSql()
    .replaceAll("`users`", `\`${usersTable}\``)
    .replaceAll("`user_account_audit`", `\`${auditTable}\``)
    .replaceAll("`users_account_audit_", `\`${prefix}_`);
  for (const statement of migrationStatements(sql)) {
    await conn.query(statement);
    if (statement.startsWith("CREATE TABLE")) auditCreated = true;
  }
  await conn.beginTransaction();
  const [insert] = await conn.execute(
    `INSERT INTO \`${usersTable}\` (name, email, password, mailing, created_at, updated_at)
     VALUES ('AuditFixture', 'audit@example.test', 'SECRET_HASH_BEFORE', NULL, NOW(), NOW())`,
  );
  const userId = insert.insertId;
  const history = async () => {
    const [rows] = await conn.execute(`SELECT * FROM \`${auditTable}\` WHERE user_id = ? ORDER BY id`, [userId]);
    return rows;
  };
  let rows = await history();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "created");
  assert.equal(rows[0].source, "database");
  assert.equal(rows[0].actor_user_id, null);
  assert.deepEqual(rows[0].changes.email, { before: null, after: "audit@example.test" });
  assert.ok(!JSON.stringify(rows).includes("SECRET_HASH_BEFORE"));
  console.log("PASS: creation snapshot without credentials");

  await conn.execute("SET @account_audit_actor_id = ?, @account_audit_source = ?", [7, "admin.users"]);
  await conn.execute(
    `UPDATE \`${usersTable}\` SET name = 'auditfixture', email = 'new@example.test', mailing = 0,
       password = 'SECRET_HASH_AFTER', google_id = 'SECRET_GOOGLE_ID', withdraw_account = 'SECRET_PAYOUT_ACCOUNT'
     WHERE id = ?`, [userId],
  );
  rows = await history();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].source, "admin.users");
  assert.equal(rows[1].actor_user_id, 7);
  assert.deepEqual(rows[1].changes.name, { before: "AuditFixture", after: "auditfixture" });
  assert.deepEqual(rows[1].changes.mailing, { before: null, after: 0 });
  assert.deepEqual(rows[1].changes.password, { changed: true });
  assert.deepEqual(rows[1].changes.withdraw_account, { changed: true });
  assert.deepEqual(rows[1].changes.google_linked, { before: false, after: true });
  assert.ok(!JSON.stringify(rows).includes("SECRET_"));
  console.log("PASS: case-only changes, actor, source, null transitions and sensitive-value redaction");

  await conn.execute(`UPDATE \`${usersTable}\` SET name = name, updated_at = NOW(), remember_token = 'SECRET_TOKEN' WHERE id = ?`, [userId]);
  assert.equal((await history()).length, 2);
  console.log("PASS: unchanged values, timestamp writes and token rotation ignored");

  await conn.execute("SET @account_audit_actor_id = NULL, @account_audit_source = NULL");
  await conn.execute(`UPDATE \`${usersTable}\` SET first_name = '' WHERE id = ?`, [userId]);
  rows = await history();
  assert.deepEqual(rows[2].changes.first_name, { before: null, after: "" });
  assert.equal(rows[2].source, "database");
  assert.equal(rows[2].actor_user_id, null);
  await conn.execute(`UPDATE \`${usersTable}\` SET first_name = NULL WHERE id = ?`, [userId]);
  rows = await history();
  assert.deepEqual(rows[3].changes.first_name, { before: "", after: null });

  await conn.query("SAVEPOINT account_audit_rollback");
  await conn.execute(`UPDATE \`${usersTable}\` SET name = 'MustRollback' WHERE id = ?`, [userId]);
  assert.equal((await history()).length, 5);
  await conn.query("ROLLBACK TO SAVEPOINT account_audit_rollback");
  assert.equal((await history()).length, 4);
  const [users] = await conn.execute(`SELECT name FROM \`${usersTable}\` WHERE id = ?`, [userId]);
  assert.equal(users[0].name, "auditfixture");
  console.log("PASS: audit rolls back with the account mutation");

  await conn.execute(`DELETE FROM \`${usersTable}\` WHERE id = ?`, [userId]);
  rows = await history();
  assert.equal(rows.length, 5);
  assert.equal(rows[4].action, "deleted");
  assert.deepEqual(rows[4].changes.email, { before: "new@example.test", after: null });
  assert.ok(!JSON.stringify(rows).includes("SECRET_"));
  console.log("PASS: history and safe deletion snapshot survive account removal");
  await conn.rollback();
  assert.equal((await history()).length, 0);
  console.log("PASS: rollback also removes creation and deletion history");
} finally {
  await conn.rollback();
  await conn.query("SET @account_audit_actor_id = NULL, @account_audit_source = NULL");
  // These are fixed, randomly named test tables created by this invocation only.
  if (usersCreated) await conn.query(`DROP TABLE \`${usersTable}\``);
  if (auditCreated) await conn.query(`DROP TABLE \`${auditTable}\``);
  await conn.end();
}
