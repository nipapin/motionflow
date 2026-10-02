/** node --env-file=.env scripts/apply-account-audit-migration.mjs */
import { accountAuditSql, auditDbConnection, migrationStatements } from "./lib/account-audit-migration.mjs";

const conn = await auditDbConnection();
try {
  for (const sql of migrationStatements(accountAuditSql())) {
    const triggerName = /^CREATE TRIGGER `([^`]+)`/.exec(sql)?.[1];
    if (triggerName) {
      const [existing] = await conn.execute(
        "SELECT ACTION_STATEMENT AS body, EVENT_OBJECT_TABLE AS tableName, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?",
        [triggerName],
      );
      if (existing.length) {
        const normalized = (value) => value.replace(/\r\n/g, "\n").trim();
        const expectedBody = sql.slice(sql.indexOf("BEGIN"));
        const expectedEvent = /AFTER (INSERT|UPDATE|DELETE) ON/.exec(sql)[1];
        if (existing[0].tableName !== "users" || existing[0].timing !== "AFTER"
          || existing[0].event !== expectedEvent || normalized(existing[0].body) !== normalized(expectedBody)) {
          throw new Error(`Existing ${triggerName} differs from this migration; no replacement was made`);
        }
        console.log(`Already installed: ${triggerName}`);
        continue;
      }
    }
    await conn.query(sql);
    console.log(`Installed: ${triggerName ?? "user_account_audit table"}`);
  }
} finally {
  await conn.end();
}
