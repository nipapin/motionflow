/** Internal packages registry ID, not a Motionflow user or marketplace author. */
export const ODIN_PACKAGES_AUTHOR_ID = 900_000_001;
export const ODIN_PACKAGES_SLUG = "odin";
export const ODIN_PACKAGES_BUCKET = "odin-pro";
/** CEP panel `client` stored on `cep_devices` for this author. */
export const ODIN_CEP_CLIENT = "odin-cep";

export function isInternalPackagesAuthor(author: { id: number; slug?: string }): boolean {
  return author.id === ODIN_PACKAGES_AUTHOR_ID || author.slug === ODIN_PACKAGES_SLUG;
}
