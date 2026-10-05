import { useState, type ImgHTMLAttributes } from "react";

const PLACEHOLDER_IMAGE = "/images/placeholder.png";

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string;
}

export function FallbackImage({ src, className = "", onError, ...props }: FallbackImageProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const showPlaceholder = !src || failedSource === src;
  const imageSource = showPlaceholder ? PLACEHOLDER_IMAGE : src;

  return (
    <span className={`fallback-image ${className}`.trim()} data-placeholder={showPlaceholder || undefined}>
      <img
        {...props}
        src={imageSource}
        onError={(event) => {
          onError?.(event);
          if (!showPlaceholder && src) setFailedSource(src);
        }}
      />
    </span>
  );
}
