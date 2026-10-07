import { themePreview, themeMediaUrl } from "./theme-media";
import type { CatalogResponse, PublicAsset } from "./types";

const pending = new Map<string, Promise<void>>();

function preloadPreview(asset: PublicAsset | undefined): Promise<void> {
  const url = themeMediaUrl(asset);
  if (!url) return Promise.resolve();
  const key = `${asset?.kind}:${url}`;
  const existing = pending.get(key);
  if (existing) return existing;

  const request = new Promise<void>((resolve) => {
    const media = asset?.kind === "video" ? document.createElement("video") : new Image();
    const readyEvent = media instanceof HTMLVideoElement ? "loadeddata" : "load";
    const finish = () => {
      window.clearTimeout(timeout);
      media.removeEventListener(readyEvent, finish);
      media.removeEventListener("error", finish);
      if (media instanceof HTMLVideoElement) {
        media.removeAttribute("src");
        media.load();
      }
      resolve();
    };
    // A slow or failed preview must not keep the catalog hidden indefinitely.
    const timeout = window.setTimeout(finish, 8_000);
    media.addEventListener(readyEvent, finish, { once: true });
    media.addEventListener("error", finish, { once: true });
    if (media instanceof HTMLVideoElement) {
      media.preload = "auto";
      media.muted = true;
      media.playsInline = true;
    }
    media.src = url;
    if (media instanceof HTMLVideoElement) media.load();
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export async function preloadThemePreviews(catalog: CatalogResponse): Promise<CatalogResponse> {
  if (typeof document === "undefined") return catalog;
  await Promise.all(catalog.items.map((theme) => preloadPreview(themePreview(theme))));
  return catalog;
}
