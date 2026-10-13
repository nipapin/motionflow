export const GAL_CONTACT_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const GAL_CONTACT_ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.zip,image/png,image/jpeg,application/zip";

const allowedExtensions = new Set(["png", "jpg", "jpeg", "zip"]);
const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/zip",
  "application/x-zip-compressed",
]);

export function validateGalContactAttachment(file: File): string | null {
  if (file.size === 0) return "Attachment is empty.";
  if (file.size > GAL_CONTACT_ATTACHMENT_MAX_BYTES) {
    return "Attachment is larger than 2 MB.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.toLowerCase();
  if (
    !allowedExtensions.has(extension) ||
    (mime && mime !== "application/octet-stream" && !allowedMimeTypes.has(mime))
  ) {
    return "Attachment must be PNG, JPG/JPEG or ZIP.";
  }
  return null;
}
