import { z } from "zod";
import { profileNameSchema } from "@/lib/validations/profile";

export const adminUserPatchSchema = z
  .object({
    name: profileNameSchema.optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    firstName: z
      .union([z.literal(""), z.string().trim().max(191)])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "" ? null : value)),
    lastName: z
      .union([z.literal(""), z.string().trim().max(191)])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "" ? null : value)),
    access: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(100)]).optional(),
    mailingOptIn: z.boolean().optional(),
    newPassword: z.string().min(8).max(191).optional(),
    extraGenerations: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export type AdminUserPatchInput = z.infer<typeof adminUserPatchSchema>;

export const adminUserGrantSubscriptionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("motionflow"),
      tier: z.enum(["creator", "creator_ai"]),
      duration: z.enum(["until_revoked", "1_month", "1_year"]),
    }),
    z.object({
      kind: z.literal("spunkram"),
      tier: z.enum(["library", "ai_toolkit"]),
      duration: z.enum(["until_revoked", "1_month", "1_year"]),
    }),
    z.object({
      kind: z.literal("premiere_gal"),
      plan: z.enum(["monthly", "yearly", "lifetime"]),
    }),
  ]);

export type AdminUserGrantSubscriptionInput = z.infer<
  typeof adminUserGrantSubscriptionSchema
>;

export const adminUserGrantPurchaseSchema = z
  .object({
    itemId: z.coerce.number().int().positive(),
  })
  .strict();
