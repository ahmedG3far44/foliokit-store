import type { PublicAsset } from "../lib/types";


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

  if (!url) {
    return (
      <span className={`flex items-center justify-center bg-neutral-100 text-[13px] font-medium text-neutral-400 ${className}`}>
        {alt}
      </span>
    );
  }

  if (asset?.kind === "video") {
    return (

      <video
        src={url}
        aria-label={alt}
        autoPlay={autoPlay ?? preview}
        loop={preview}
        muted={preview}
        playsInline
        controls={!preview}
        preload="metadata"
        className={className}
      />

    );
  }

  return <img src={url} alt={alt} loading="lazy" className={className} />
}
