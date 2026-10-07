import type { PublicAsset, ThemeType } from "../lib/types";

export function themeMediaUrl(asset?: PublicAsset) {
  return asset?.kind === "image" ? asset.variants?.at(-1)?.url ?? asset.url : asset?.url;
}

export function themePreview(theme: ThemeType) {
  // Older themes did not have a dedicated preview. Keep their media visible.
  return theme.previewAsset ?? theme.videos[0] ?? theme.images[0];
}

