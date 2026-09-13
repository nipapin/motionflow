import { z } from "zod";

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{3,32}$/, "Use 3-32 lowercase letters, digits or dashes");

/** Empty string from a form input means "no value". */
const optionalUrl = z
  .union([z.literal(""), z.string().trim().url().max(512)])
  .optional()
  .transform((value) => (value ? value : null));

export const affiliateCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(255),
    socialUrl: optionalUrl,
    slug,
    commissionPercent: z.coerce.number().min(1).max(100),
    recurringMode: z.enum(["first_only", "all"]),
  })
  .strict();

export const affiliateUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    socialUrl: optionalUrl,
    commissionPercent: z.coerce.number().min(1).max(100).optional(),
    recurringMode: z.enum(["first_only", "all"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict();

export const affiliatePayoutMarkPaidSchema = z
  .object({
    affiliateId: z.coerce.number().int().positive(),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const affiliatePayoneerSchema = z
  .object({
    payoneerEmail: z
      .union([z.literal(""), z.string().trim().toLowerCase().email().max(255)])
      .transform((value) => (value ? value : null)),
  })
  .strict();
