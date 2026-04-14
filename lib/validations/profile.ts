import { z } from "zod";

const nameRegex = /^[a-zA-Z0-9\s\-_.]+$/i;

export const profileNameSchema = z
  .string()
  .trim()
  .min(1, "Login name is required")
  .max(25, "Login name must be at most 25 characters")
  .regex(
    nameRegex,
    "Use English letters, numbers, spaces, dashes, underscores, and dots only",
  );

export const profilePatchSchema = z
  .object({
    name: profileNameSchema.optional(),
    email: z.string().trim().email().max(255).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
    newPassword_confirmation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const wantsPassword =
      (data.newPassword !== undefined && data.newPassword.length > 0) ||
      (data.newPassword_confirmation !== undefined &&
        (data.newPassword_confirmation?.length ?? 0) > 0);

    if (wantsPassword) {
      if (!data.currentPassword?.length) {
        ctx.addIssue({
          code: "custom",
          message: "Current password is required",
          path: ["currentPassword"],
        });
      }
      if (data.newPassword !== data.newPassword_confirmation) {
        ctx.addIssue({
          code: "custom",
          message: "Password confirmation does not match",
          path: ["newPassword_confirmation"],
        });
      }
    }
  });

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
