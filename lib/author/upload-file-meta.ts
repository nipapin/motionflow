/** Maps contributor upload `File` → presign `extension` + `Content-Type` (must match PUT). */

export type SignExtension = "jpg" | "jpeg" | "png" | "webp" | "gif" | "mp4" | "webm" | "mov" | "zip";

const SIGN_EXTENSIONS = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "mp4",
  "webm",
  "mov",
  "zip",
]);

const EXT_TO_CT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  zip: "application/zip",
};

const MIME_TO_EXT: Record<string, SignExtension> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

function toSignExtension(raw: string): SignExtension | null {
  const e = raw.toLowerCase();
  if (!SIGN_EXTENSIONS.has(e)) return null;
  return e as SignExtension;
}

/**
 * Infer extension for `/api/profile/upload/sign` and Content-Type for the presigned PUT.
 */
export function inferSignExtensionAndContentType(file: File): { extension: SignExtension; contentType: string } | null {
  const name = file.name.trim();
  const dot = name.lastIndexOf(".");
  const extFromName = dot >= 0 ? name.slice(dot + 1) : "";
  const mime = (file.type || "").split(";")[0]?.trim().toLowerCase() ?? "";

  const fromName = toSignExtension(extFromName);
  if (fromName) {
    const contentType = (EXT_TO_CT[fromName] ?? mime) || "application/octet-stream";
    return { extension: fromName, contentType };
  }

  const fromMime = mime ? MIME_TO_EXT[mime] : undefined;
  if (fromMime) {
    return { extension: fromMime, contentType: mime };
  }

  return null;
}
