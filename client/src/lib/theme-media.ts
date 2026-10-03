import type { ThemeType } from "../lib/types";

export function themePreview(theme: ThemeType) {
  // Older themes did not have a dedicated preview. Keep their media visible.
  return theme.previewAsset ?? theme.videos[0] ?? theme.images[0];
}

