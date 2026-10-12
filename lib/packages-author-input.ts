import { z } from "zod";

export function packagesAuthorSlug(label: string): string {
  return label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const newPackagesAuthorSchema = z.object({
  id: z.number().int().min(1).max(4294967295),
  label: z.string().trim().min(1, "Enter a display name").max(255),
  r2_bucket: z.string().trim().max(63).nullable().optional(),
}).transform((input) => ({ ...input, slug: packagesAuthorSlug(input.label) }))
  .refine((input) => input.slug.length > 0 && input.slug.length <= 64, {
    message: "Display name must produce a slug of 1–64 characters using letters a–z and numbers",
    path: ["label"],
  });

// Cloudflare R2 bucket naming rules, also used by the creation form.
export const newPackagesBucketSchema = z.object({
  name: z.string().trim().min(3).max(63).regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Use 3–63 lowercase letters, numbers or hyphens; start and end with a letter or number",
  ),
});

export type NewPackagesAuthorInput = z.infer<typeof newPackagesAuthorSchema>;
