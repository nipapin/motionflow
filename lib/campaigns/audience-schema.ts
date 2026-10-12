import { z } from "zod";
export const campaignAudienceSchema = z.object({
  authorIds: z.array(z.number().int().positive()).max(50),
  subscription: z.enum(["all", "has", "none", "active", "no_active"]),
  verified: z.enum(["all", "verified", "unverified"]), mailing: z.enum(["all", "opted_in", "opted_out"]),
  purchases: z.enum(["all", "has", "none"]), devices: z.enum(["all", "has", "none"]),
  role: z.enum(["all", "buyer", "partner", "author", "admin"]).default("all"),
  match: z.enum(["all", "any"]), rules: z.array(z.object({
    field: z.string().regex(/^[a-zA-Z0-9_]+$/).max(64),
    operator: z.enum(["eq", "ne", "contains", "not_contains", "starts", "ends", "gt", "gte", "lt", "lte", "empty", "not_empty"]),
    value: z.string().max(500),
  })).max(30),
});
export const campaignDeliverySchema = z.object({
  provider: z.enum(["resend", "mailgun"]), from_email: z.string().trim().email().max(254),
  from_name: z.string().trim().min(1).max(100).regex(/^[^\r\n<>]+$/),
  mailing_list: z.string().email().nullable().optional(),
});
