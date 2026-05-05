"use client";

import { inferSignExtensionAndContentType } from "@/lib/author/upload-file-meta";
import type { ProductFiles } from "@/lib/product-types";

export type UploadSlot = "image" | "video" | "main";

export type UploadItemAttributes = {
  works_with?: string;
  os_compatibles?: string;
  file_size?: string;
};

export type UploadItemPatchResult = {
  files: ProductFiles;
  attributes?: UploadItemAttributes;
};

function formatBytesOneDecimal(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export async function uploadItemFileToR2(itemId: number, slot: UploadSlot, file: File): Promise<UploadItemPatchResult> {
  const inferred = inferSignExtensionAndContentType(file);
  if (!inferred) {
    throw new Error("Unsupported file type.");
  }

  const signRes = await fetch("/api/profile/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      itemId,
      contentType: inferred.contentType,
      extension: inferred.extension,
    }),
  });
  const signJson = (await signRes.json().catch(() => ({}))) as {
    error?: string;
    putUrl?: string;
    key?: string;
  };
  if (!signRes.ok || !signJson.putUrl || !signJson.key) {
    throw new Error(signJson.error ?? "Presign failed");
  }

  const putRes = await fetch(signJson.putUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": inferred.contentType },
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  const filename = signJson.key.split("/").pop();
  if (!filename) throw new Error("Invalid key");

  const patchRes = await fetch(`/api/profile/upload/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      files: { [slot]: filename },
      attributes: slot === "main" ? { file_size: formatBytesOneDecimal(file.size) } : undefined,
    }),
  });
  const patchJson = (await patchRes.json().catch(() => ({}))) as {
    error?: string;
    files?: ProductFiles;
    attributes?: UploadItemAttributes;
  };
  if (!patchRes.ok || !patchJson.files) {
    throw new Error(patchJson.error ?? "Could not save file reference");
  }

  return {
    files: patchJson.files,
    attributes: patchJson.attributes,
  };
}
