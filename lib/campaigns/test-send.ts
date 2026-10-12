import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { campaignTestSendSchema } from "./schema";
import { addDuration, assertSendable, renderCampaignEmail, sqlDate } from "./core.mjs";
import { assertCampaignMailConfigured, campaignMailClient, validateCampaignDelivery } from "./mail";

export async function sendCampaignTest(value: z.input<typeof campaignTestSendSchema>) {
  const input = campaignTestSendSchema.parse(value);
  const { delivery } = input;
  validateCampaignDelivery(delivery);
  assertCampaignMailConfigured(delivery.provider);
  if (input.to === delivery.mailing_list?.toLowerCase() || (delivery.provider === "mailgun" && /^campaign-[\da-f-]+@/i.test(input.to) && input.to.split("@")[1] === process.env.MAILGUN_DOMAIN?.trim().toLowerCase())) {
    throw new Error("Choose an individual email address for the test, not a campaign mailing list");
  }
  // Test rendering deliberately has no campaign, user, access or reset-token writes.
  // Fixed sample dates keep retries identical for Resend's idempotency contract.
  const now = new Date("2027-01-15T12:00:00Z");
  const expires = addDuration(now, input.grant.duration);
  const email = renderCampaignEmail({
    site_origin: input.site_origin, grant: input.grant, product_name: input.product_name,
    template: input.template, extension_template: input.kind === "extension" ? input.template : null,
  }, {
    email: input.to, account_email: input.to, first_name: "Alex", last_name: "Example",
    action: input.kind === "extension" ? "extend_access" : "grant_access",
    base_at: sqlDate(now), expires_at: expires ? sqlDate(expires) : null,
  }, input.kind === "welcome" ? `${input.site_origin.replace(/\/$/, "")}/?campaign_test=1` : "");
  email.subject = `[Test] ${email.subject}`;
  assertSendable(email);
  if (/\r|\n/.test(email.subject)) throw new Error("The email subject must be a single line");
  const payload = { from: `${delivery.from_name} <${delivery.from_email}>`, to: input.to, ...email };
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const result = await campaignMailClient(delivery.provider).emails.send(payload, {
    idempotencyKey: `admin-campaign-test/${input.key}/${fingerprint}`,
  });
  const provider = delivery.provider === "mailgun" ? "Mailgun" : "Resend";
  if (result.error) throw new Error(`${provider}: ${result.error.message}`);
  if (!result.data?.id) throw new Error(`${provider} did not confirm receipt. Check the provider before sending another test.`);
  return { provider: delivery.provider, to: input.to, id: result.data.id };
}
