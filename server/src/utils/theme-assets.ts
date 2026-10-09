type Asset = { kind: string; contentType?: string; status: string };
export type ThemeAssetSelection = { previewAssetId?: string; imageAssetIds: string[]; videoAssetIds: string[]; sourceAssetId?: string };

export function themeAssetIssues(selection: ThemeAssetSelection, assets: Map<string, Asset>) {
  const issues: Array<{ path: string[]; message: string }> = [];
  const ready = (id?: string) => id && assets.get(id)?.status === "ready" ? assets.get(id) : undefined;
  const preview = ready(selection.previewAssetId);
  if (!preview || !(preview.kind === "video" && ["video/mp4", "video/webm"].includes(preview.contentType ?? "") || preview.kind === "image" && ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(preview.contentType ?? ""))) {
    issues.push({ path: ["previewAssetId"], message: "Upload one ready image, MP4, WebM, or GIF preview" });
  }
  if (selection.imageAssetIds.length < 2 || selection.imageAssetIds.length > 10 || selection.imageAssetIds.some((id) => {
    const asset = ready(id);
    return asset?.kind !== "image" || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(asset.contentType ?? "");
  })) issues.push({ path: ["imageAssetIds"], message: "Upload 2–10 ready theme images (JPG, PNG, WebP, or AVIF)" });
  if (selection.videoAssetIds.length < 1 || selection.videoAssetIds.length > 2 || selection.videoAssetIds.some((id) => {
    const asset = ready(id);
    return asset?.kind !== "video" || !["video/mp4", "video/webm"].includes(asset.contentType ?? "");
  })) issues.push({ path: ["videoAssetIds"], message: "Upload 1–2 ready tutorial videos (MP4 or WebM)" });
  if (ready(selection.sourceAssetId)?.kind !== "theme_zip") issues.push({ path: ["sourceAssetId"], message: "Upload a ready source ZIP file" });
  const ids = [selection.previewAssetId, ...selection.imageAssetIds, ...selection.videoAssetIds, selection.sourceAssetId].filter(Boolean);
  if (new Set(ids).size !== ids.length) issues.push({ path: ["previewAssets"], message: "Use separate files for the preview, gallery, tutorials, and source" });
  return issues;
}
