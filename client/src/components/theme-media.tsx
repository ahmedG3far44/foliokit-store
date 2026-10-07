import type { PublicAsset } from "../lib/types";
import { useState } from "react";
import { FallbackImage } from "./fallback-image";
import { themeMediaUrl } from "../lib/theme-media";


export function ThemeMedia({
  asset,
  alt,
  preview = false,
  autoPlay,
  className = "",
  loading = "eager",

}: {
  asset?: PublicAsset;
  alt: string;
  preview?: boolean;
  autoPlay?: boolean;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const url = themeMediaUrl(asset);
  const [failedVideo, setFailedVideo] = useState<string>();

  if (asset?.kind === "video" && url && failedVideo !== url) {
    return (
      <video
        src={url}
        aria-label={alt}
        autoPlay={autoPlay ?? preview}
        loop={preview}
        muted={preview}
        playsInline
        controls={!preview}
        preload={loading === "lazy" ? "none" : "auto"}
        className={className}
        onError={() => setFailedVideo(url)}
      />
    );
  }

  return <FallbackImage src={asset?.kind === "video" ? undefined : url} alt={alt} loading={loading} decoding="async" className={className} />;
}
