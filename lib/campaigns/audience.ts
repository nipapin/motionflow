import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { listPackagesAuthors } from "@/lib/packages-admin";
import { getCepClientByAuthorId } from "@/lib/cep-client-registry";
import { getExtraGenPacks } from "@/lib/extra-generation-packs";
import { getSpunkramExtraGenPacks } from "@/lib/spunkram-paddle-config";
import { audienceFieldsFromColumns, compileCampaignAudience } from "./audience-query";
import { campaignMailOptions, createCampaignMailingList } from "./mail";
import type { CampaignAudience } from "./audience-shared";

async function audienceFields() {
  const [columns] = await getPool().query<RowDataPacket[]>("SHOW COLUMNS FROM users");
  return audienceFieldsFromColumns(columns as { Field: string; Type: string }[]);
}
export async function campaignAudienceOptions() {
  const [fields, authors] = await Promise.all([audienceFields(), listPackagesAuthors()]);
  return { fields, authors: authors.map(author => ({ id: author.id, label: author.label })), mail: campaignMailOptions() };
}

export async function campaignAudiencePreview(input: CampaignAudience, action: "preview" | "import" | "mailing_list", list?: { key: string; name: string }) {
  const authors = await listPackagesAuthors();
  if (input.authorIds.some(id => !authors.some(author => author.id === id))) throw new Error("Choose an available author");
  const clients = input.authorIds.map(id => getCepClientByAuthorId(id)?.client).filter((client): client is string => Boolean(client));
  const excluded = [...getExtraGenPacks(), ...getSpunkramExtraGenPacks()].map(pack => pack.priceId).filter((price): price is string => Boolean(price));
  const query = compileCampaignAudience(input, await audienceFields(), clients, excluded);
  const pool = getPool();
  const [counts] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${query.sql}`, query.params);
  const total = Number(counts[0].total);
  if (action !== "preview" && total > 5000) throw new Error("This campaign supports up to 5,000 recipients. Narrow the audience filters first.");
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT u.id,u.name,u.email,u.first_name,u.last_name ${query.sql} ORDER BY u.id ASC LIMIT ${action === "preview" ? 50 : 5000}`, query.params);
  const seen = new Set<string>();
  const users = rows.flatMap(row => {
    const email = String(row.email).trim().toLowerCase();
    if (!/^[^\s@,;<>"\\]+@[^\s@,;<>"\\]+\.[^\s@,;<>"\\]+$/.test(email) || seen.has(email)) return [];
    seen.add(email);
    return [{ id: Number(row.id), name: String(row.name || ""), email, first_name: String(row.first_name || row.name || ""), last_name: String(row.last_name || "") }];
  });
  if (action === "preview") return { total, users };
  if (!users.length) throw new Error("No valid recipient addresses match these filters");
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const recipients_source = ["Email,First Name,Last Name", ...users.map(user => [user.email, user.first_name, user.last_name].map(cell).join(","))].join("\n");
  const mailing_list = action === "mailing_list" ? await createCampaignMailingList(list!.key, list!.name, users) : undefined;
  return { total, users: users.slice(0, 50), recipients: users.length, recipients_source, ...(mailing_list ? { mailing_list } : {}) };
}
