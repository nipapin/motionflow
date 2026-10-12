import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { mailFromMailbox } from "@/lib/mail/resend-mailer";
import type { CampaignDelivery, CampaignMailOptions } from "./audience-shared";

const split = (value?: string) => (value || "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
export function campaignMailOptions(): CampaignMailOptions {
  const mailbox = mailFromMailbox().toLowerCase();
  const domain = process.env.MAILGUN_DOMAIN?.trim().toLowerCase() || "";
  const resend = [...new Set([mailbox, ...split(process.env.CAMPAIGN_RESEND_SENDERS)])];
  const mailgun = [...new Set([...(domain ? [`hello@${domain}`, `do-not-reply@${domain}`] : []), ...split(process.env.CAMPAIGN_MAILGUN_SENDERS)])];
  return {
    resend: { configured: Boolean(process.env.RESEND_API_KEY?.trim()), addresses: resend, domains: [...new Set([...resend.map(email => email.split("@")[1]), ...split(process.env.CAMPAIGN_RESEND_DOMAINS)])] },
    mailgun: { configured: Boolean(domain && (process.env.MAILGUN_SECRET || process.env.MAILGUN_API_KEY)?.trim()), addresses: mailgun, domains: [...new Set([...(domain ? [domain] : []), ...mailgun.map(email => email.split("@")[1])])] },
  };
}

export function validateCampaignDelivery(delivery: CampaignDelivery) {
  const options = campaignMailOptions()[delivery.provider];
  if (!options.domains.includes(delivery.from_email.split("@")[1]?.toLowerCase())) throw new Error("Choose a sender address on a configured sending domain");
  if (/[\r\n<>]/.test(delivery.from_name)) throw new Error("Invalid sender name");
}
export function assertCampaignMailConfigured(provider: "resend" | "mailgun") {
  if (!campaignMailOptions()[provider].configured) throw new Error(`${provider === "mailgun" ? "Mailgun" : "Resend"} is not configured on the server`);
}

export class MailgunRequestError extends Error {
  constructor(message: string, readonly status: number, readonly definitelyRejected = false) { super(message); }
}
export async function mailgunRequest(path: string, form?: URLSearchParams) {
  assertCampaignMailConfigured("mailgun");
  const host = (process.env.MAILGUN_ENDPOINT || "api.mailgun.net").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!["api.mailgun.net", "api.eu.mailgun.net"].includes(host)) throw new Error("Choose the US or EU Mailgun API endpoint");
  const secret = (process.env.MAILGUN_SECRET || process.env.MAILGUN_API_KEY)!.trim();
  const response = await fetch(`https://${host}/v3${path}`, {
    method: form ? "POST" : "GET", headers: { Authorization: `Basic ${Buffer.from(`api:${secret}`).toString("base64")}` },
    body: form, signal: AbortSignal.timeout(30_000), cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new MailgunRequestError(`Mailgun: ${String(data.message || "Request failed").slice(0, 300)}`, response.status, response.status >= 400 && response.status < 500 && response.status !== 408);
  return data;
}

export function campaignMailClient(provider: "resend" | "mailgun") {
  if (provider === "resend") return new Resend(process.env.RESEND_API_KEY);
  return { emails: { send: async (payload: { from: string; to: string; subject: string; text: string; html: string }, options: { idempotencyKey: string }) => {
    const domain = process.env.MAILGUN_DOMAIN!.trim();
    const messageId = `<${createHash("sha256").update(options.idempotencyKey).digest("hex")}@${domain}>`;
    const result = await mailgunRequest(`/${encodeURIComponent(domain)}/messages`, new URLSearchParams({
      ...payload, "h:Message-Id": messageId, "v:campaign_key": options.idempotencyKey,
    }));
    if (!result.id) throw new Error("Mailgun did not confirm receipt. Check the provider before retrying.");
    return { data: { id: String(result.id) }, error: null };
  } } };
}

export async function campaignListMemberSubscribed(address: string, email: string): Promise<boolean> {
  if (address.split("@")[1]?.toLowerCase() !== process.env.MAILGUN_DOMAIN?.trim().toLowerCase()) throw new Error("The campaign mailing list uses a different Mailgun domain");
  try {
    const result = await mailgunRequest(`/lists/${encodeURIComponent(address)}/members/${encodeURIComponent(email)}`);
    return result.member?.subscribed === true;
  } catch (error) {
    if (error instanceof MailgunRequestError && error.status === 404) return false;
    throw error;
  }
}

export async function createCampaignMailingList(key: string, name: string, members: { id: number; name: string; email: string }[]) {
  const address = `campaign-${key}@${process.env.MAILGUN_DOMAIN?.trim()}`;
  const snapshot = createHash("sha256").update(JSON.stringify(members.map(member => [member.id, member.email]))).digest("hex");
  const description = `Motion Flow campaign ${key}; audience ${snapshot}`;
  try {
    const result = await mailgunRequest(`/lists/${encodeURIComponent(address)}`);
    if (result.list?.description !== description) throw new Error("This mailing list belongs to a different audience. Create a new list.");
    // A completed snapshot is reused without updating member subscription flags.
    if (Number(result.list?.members_count) === members.length) return address;
    if (Number(result.list?.members_count) > members.length) throw new Error("Mailing list membership changed. Create a new list for this audience.");
  } catch (err) {
    if (!(err instanceof MailgunRequestError) || err.status !== 404) throw err;
    await mailgunRequest("/lists", new URLSearchParams({ address, name, description, access_level: "readonly", reply_preference: "sender" }));
  }
  for (let index = 0; index < members.length; index += 1000) {
    const batch = members.slice(index, index + 1000).map(member => ({ address: member.email, name: member.name, vars: JSON.stringify({ user_id: member.id }) }));
    await mailgunRequest(`/lists/${encodeURIComponent(address)}/members.json`, new URLSearchParams({ members: JSON.stringify(batch), upsert: "yes" }));
  }
  return address;
}
