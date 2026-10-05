import type { PublicAsset } from "../lib/types";
import { useState } from "react";
import { FallbackImage } from "./fallback-image";


export function ThemeMedia({
  asset,
  alt,
  preview = false,
  autoPlay,
  className = "",

}: {
  asset?: PublicAsset;
  alt: string;
  preview?: boolean;
  autoPlay?: boolean;
  className?: string;
}) {
  const url = asset?.kind === "image" ? asset.variants?.at(-1)?.url ?? asset.url : asset?.url;
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
        preload={preview ? "auto" : "metadata"}
        className={className}
        onError={() => setFailedVideo(url)}
      />
    );
  }

  return <FallbackImage src={url} alt={alt} loading="eager" decoding="async" className={className} />;
}
