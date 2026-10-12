import { activeAuthorSubscriptionSql } from "@/lib/extension-users-query";
import { AUDIENCE_OPERATORS, type AudienceField, type CampaignAudience } from "./audience-shared";

export function audienceFieldsFromColumns(columns: { Field: string; Type: string }[]): AudienceField[] {
  return columns.filter(({ Field }) => /^[a-zA-Z0-9_]+$/.test(Field) && !/password|token|secret|remember|two_factor|recovery/i.test(Field))
    .map(({ Field, Type }) => ({ name: Field, label: Field.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()),
      kind: /^(?:tinyint|smallint|mediumint|int|bigint|decimal|float|double|bit|year)/i.test(Type) ? "number" : /^(?:date|datetime|timestamp)/i.test(Type) ? "date" : "text" }));
}

export function compileCampaignAudience(input: CampaignAudience, fields: AudienceField[], clients: string[] = [], excludedSubscriptionPrices: string[] = []) {
  const params: (string | number)[] = [];
  const clauses = ["u.email IS NOT NULL", "TRIM(u.email) <> ''"];
  const scope = (alias: string) => {
    if (!input.authorIds.length) return "";
    params.push(...input.authorIds);
    return ` AND ${alias}.author_id IN (${input.authorIds.map(() => "?").join(",")})`;
  };
  const deviceScope = () => {
    if (!input.authorIds.length) return "";
    if (!clients.length) return " AND 1=0";
    params.push(...clients);
    return ` AND d.client IN (${clients.map(() => "?").join(",")})`;
  };
  if (input.authorIds.length) {
    const sub = `EXISTS (SELECT 1 FROM subscription_systems ss WHERE ss.buyer_id=u.id${scope("ss")})`;
    const sold = `EXISTS (SELECT 1 FROM sold_items si WHERE si.buyer_id=u.id AND si.status=1${scope("si")})`;
    const devices = `EXISTS (SELECT 1 FROM cep_devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL${deviceScope()})`;
    clauses.push(`(${sub} OR ${sold} OR ${devices})`);
  }
  if (input.subscription !== "all") {
    const authorScope = scope("ss");
    const excluded = excludedSubscriptionPrices.length ? ` AND (ss.paddle_price_id IS NULL OR ss.paddle_price_id NOT IN (${excludedSubscriptionPrices.map(() => "?").join(",")}))` : "";
    params.push(...excludedSubscriptionPrices);
    const active = ["active", "no_active"].includes(input.subscription) ? ` AND ${activeAuthorSubscriptionSql("ss")}` : "";
    const exists = `EXISTS (SELECT 1 FROM subscription_systems ss WHERE ss.buyer_id=u.id${authorScope}${excluded}${active})`;
    clauses.push(["none", "no_active"].includes(input.subscription) ? `NOT ${exists}` : exists);
  }
  if (input.verified !== "all") clauses.push(`u.email_verified_at IS ${input.verified === "verified" ? "NOT " : ""}NULL`);
  if (input.mailing !== "all") clauses.push(input.mailing === "opted_in" ? "u.mailing=0" : "(u.mailing IS NULL OR u.mailing<>0)");
  const roles = { buyer: "(u.access=0 OR u.access IS NULL)", partner: "u.access=1", author: "(u.access>=2 AND u.access<>100)", admin: "u.access=100" };
  if (input.role && input.role !== "all") clauses.push(roles[input.role]);
  if (input.purchases !== "all") {
    const exists = `EXISTS (SELECT 1 FROM sold_items si WHERE si.buyer_id=u.id AND si.status=1${scope("si")})`;
    clauses.push(input.purchases === "none" ? `NOT ${exists}` : exists);
  }
  if (input.devices !== "all") {
    const exists = `EXISTS (SELECT 1 FROM cep_devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL${deviceScope()})`;
    clauses.push(input.devices === "none" ? `NOT ${exists}` : exists);
  }
  const ruleSql = input.rules.map(rule => {
    const field = fields.find(item => item.name === rule.field);
    if (!field || !/^[a-zA-Z0-9_]+$/.test(field.name) || !AUDIENCE_OPERATORS[field.kind].some(op => op === rule.operator)) throw new Error("Unknown audience field or operator");
    const column = `u.\`${field.name}\``;
    if (["empty", "not_empty"].includes(rule.operator)) {
      const empty = field.kind === "text" ? `(${column} IS NULL OR ${column}='')` : `${column} IS NULL`;
      return rule.operator === "empty" ? empty : `NOT (${empty})`;
    }
    if (!rule.value.trim()) throw new Error(`Enter a value for ${field.label}`);
    let value: string | number = rule.value.trim();
    if (field.kind === "number") { value = Number(value); if (!Number.isFinite(value)) throw new Error(`Enter a number for ${field.label}`); }
    if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(String(value))) throw new Error(`Enter a date for ${field.label}`);
    if (["contains", "not_contains", "starts", "ends"].includes(rule.operator)) {
      const escaped = String(value).replace(/[\\%_]/g, "\\$&");
      params.push(rule.operator === "starts" ? `${escaped}%` : rule.operator === "ends" ? `%${escaped}` : `%${escaped}%`);
      return `${column} ${rule.operator === "not_contains" ? "NOT " : ""}LIKE ? ESCAPE '\\\\'`;
    }
    const operators: Record<string, string> = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
    params.push(value);
    return `${column} ${operators[rule.operator]} ?`;
  });
  if (ruleSql.length) clauses.push(`(${ruleSql.join(input.match === "any" ? " OR " : " AND ")})`);
  return { sql: `FROM users u WHERE ${clauses.join(" AND ")}`, params };
}
