import { z } from "zod";

const nameRegex = /^[a-zA-Z0-9\s\-_.]+$/i;

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1),
});

export const registerSchema = z
  .object({
    email: z.string().trim().email().max(255),
    name: z
      .string()
      .trim()
      .min(1, "Login name is required")
      .max(25, "Login name must be at most 25 characters")
      .regex(
        nameRegex,
        "Use English letters, numbers, spaces, dashes, underscores, and dots only",
      ),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirmation: z.string(),
    agree: z.boolean().refine((v) => v === true, "You must accept the terms of service"),
    mailing: z.boolean().optional(),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: "Password confirmation does not match",
    path: ["password_confirmation"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
