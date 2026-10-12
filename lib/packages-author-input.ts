import { z } from "zod";

export const newPackagesAuthorSchema = z.object({
  id: z.number().int().min(1).max(4294967295),
  label: z.string().trim().min(1, "Enter a display name").max(255),
  slug: z.string().trim().min(1).max(64).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens for the slug",
  ),
  r2_bucket: z.string().trim().max(63).nullable().optional(),
});

export type NewPackagesAuthorInput = z.infer<typeof newPackagesAuthorSchema>;
