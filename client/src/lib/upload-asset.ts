import type { PublicAsset, AssetKind } from "./types";
import { api } from "./api";
type UploadKind = AssetKind;
export type UploadTransfer = { uploadedBytes: number; totalBytes: number };
function fileContentType(file: File, kind: UploadKind): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif",
    mp4: "video/mp4", webm: "video/webm", zip: "application/zip",
  };
  return extension && byExtension[extension] ? byExtension[extension] : kind === "theme_zip" ? "application/zip" : "application/octet-stream";
}

export async function uploadAsset(file: File, kind: UploadKind, update: (progress: number, phase: string, transfer: UploadTransfer) => void): Promise<PublicAsset> {
  let assetId: string | undefined;
  let uploadedBytes = 0;
  const report = (progress: number, phase: string) => update(progress, phase, { uploadedBytes, totalBytes: file.size });
  try {
    report(5, "Preparing upload");
    const init = await api.post<{ asset: PublicAsset; uploadId: string; partSizeBytes: number }>("/admin/uploads/initiate", {
      kind, originalName: file.name,
      contentType: fileContentType(file, kind),
      sizeBytes: file.size,
    });
    assetId = init.asset.id;
    const parts: Array<{ ETag: string; PartNumber: number }> = [];
    const count = Math.ceil(file.size / init.partSizeBytes);

    for (let index = 0; index < count; index++) {
      const partNumber = index + 1;
      report(10 + Math.round(index / count * 80), count > 1 ? `Uploading part ${partNumber} of ${count}` : "Uploading to Cloudflare R2");
      const part = file.slice(index * init.partSizeBytes, Math.min(file.size, (index + 1) * init.partSizeBytes));
      const { ETag } = await api.uploadPart(`/admin/uploads/${assetId}/parts/${partNumber}`, part);
      parts.push({ ETag, PartNumber: partNumber });
      uploadedBytes += part.size;
      report(10 + Math.round(partNumber / count * 80), count > 1 ? `Uploaded part ${partNumber} of ${count}` : "Upload transferred");
    }

    report(95, kind === "image" ? "Optimizing image" : "Verifying upload");
    const asset = await api.post<PublicAsset>(`/admin/uploads/${assetId}/complete`, { parts });
    report(100, "Upload complete");
    return asset;
  } catch (error) {
    if (assetId) await api.delete(`/admin/uploads/${assetId}`).catch(() => undefined);
    if (error instanceof TypeError) throw new Error("The upload service could not be reached. Check your connection and retry");
    throw error;
  }
}

