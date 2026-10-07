import { useState, type ImgHTMLAttributes } from "react";

const PLACEHOLDER_IMAGE = "/images/placeholder.png";

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string;
}

export function FallbackImage({ src, className = "", onError, ...props }: FallbackImageProps) {
  return <ImageWithLoading key={src} src={src} className={className} onError={onError} {...props} />;
}

function ImageWithLoading({ src, className = "", onError, onLoad, ...props }: FallbackImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showPlaceholder = !src || failed;
  const imageSource = showPlaceholder ? PLACEHOLDER_IMAGE : src;
  const pending = !showPlaceholder && !loaded;

  return (
    <span className={`fallback-image ${pending ? "skeleton " : ""}${className}`.trim()} data-placeholder={showPlaceholder || undefined} data-loading={pending || undefined} aria-busy={pending}>
      <img
        {...props}
        src={imageSource}
        ref={(image) => {
          if (image?.complete && image.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          if (!showPlaceholder) setFailed(true);
          onError?.(event);
        }}
      />
    </span>
  );
}
