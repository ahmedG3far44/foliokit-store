/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import { api } from "../lib/api";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAsync } from "../hooks/use-async";
import { useCart } from "../context/cart-store";
import { useAppAuth } from "../context/auth-store";
import { Spinner } from "../components/ui/spinner";
import { ErrorState } from "./error/error";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PreviewHeader, type PreviewDevice } from "../components/preview-header";

import type { ThemeType } from "../lib/types";

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  mobile: "375px",
  tablet: "768px",
  desktop: "100%",
};

export default function ThemePreviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const request = useAsync<ThemeType>();
  const cart = useCart();
  const navigate = useNavigate();

  const { user } = useAppAuth();

  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    if (slug) {
      setIframeError(false);
      setIframeLoaded(false);
      void request.run(api.get<ThemeType>(`/themes/${slug}`)).catch(() => undefined);
    }
  }, [slug]);

  // reset loaded state when switching theme
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
  }, [slug]);

  const theme = request.data;

  const handleCheckout = async () => {
    if (!theme) return;
    if (theme.purchased) {
      navigate("/purchases");
      return;
    }
    if (theme.canPurchase === false) return;
    if (user?.role === "admin") return;
    if (!user) {
      navigate("/sign-in");
      return;
    }
    const alreadyInCart = cart.cart?.items.some((item) => item.themeId === theme.id);
    if (alreadyInCheckedCart(alreadyInCart)) {
      navigate("/cart");
      return;
    }
    // add to cart then go to cart
    try {
      await cart.add(theme.id);
      navigate("/cart");
    } catch {
      // toast already handled by cart context; stay on page
    }
  };

  function alreadyInCheckedCart(val: boolean | undefined) { return val === true; }

  if (request.isLoading && !theme) {
    return (
      <div className="preview-page preview-loading">
        <div className="preview-loading-bar" />
        <div className="page-loader">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  if (request.error || !theme) {
    return <ErrorState
      title={request.error ? "We couldn’t load this preview" : "Theme not found"}
      message={request.error ?? "This theme preview is no longer available."}
      onRetry={slug ? () => void request.run(api.get<ThemeType>(`/themes/${slug}`)).catch(() => undefined) : undefined}
      retryLabel="Reload preview"
      backTo={slug ? `/themes/${slug}` : "/themes"}
      backLabel={slug ? "Back to theme details" : "Browse themes"}
    />;
  }

  if (!theme.previewUrl) {
    return (
      <div className="preview-page">
        <PreviewHeader theme={theme} device={device} onDeviceChange={setDevice} onCheckout={() => void handleCheckout()} />
        <div className="preview-unavailable">
          <h2>No live preview available</h2>
          <p>This theme doesn’t have a live demo URL configured yet.</p>
          <Link className="primary-button" to={`/themes/${theme.slug}`}>
            Back to details
          </Link>
        </div>
      </div>
    );
  }

  let isValidPreview = true;
  try {
    const u = new URL(theme.previewUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") isValidPreview = false;
  } catch {
    isValidPreview = false;
  }

  const frameWidth = DEVICE_WIDTH[device];

  return (
    <div className="preview-page">
      <PreviewHeader theme={theme} device={device} onDeviceChange={setDevice} onCheckout={() => void handleCheckout()} />

      <div className="preview-viewport">
        {!isValidPreview ? (
          <div className="preview-unavailable">
            <h2>Invalid preview URL</h2>
            <p>The configured live demo URL is not valid.</p>
            <a className="secondary-button" href={theme.previewUrl} target="_blank" rel="noreferrer">
              Try opening directly <ExternalLink size={14} />
            </a>
          </div>
        ) : (
          <div
            className={`preview-frame-wrap preview-device-${device}`}
            style={{ width: device === "desktop" ? "100%" : frameWidth }}
          >
            {!iframeLoaded && !iframeError && (
              <div className="preview-iframe-loader" aria-hidden="true">
                <Spinner size="md" />
                <span>Loading preview…</span>
              </div>
            )}

            {iframeError && (
              <div className="preview-iframe-error">
                <h3>Preview blocked</h3>
                <p>This demo blocks embedding. Open it in a new tab to view the full experience.</p>
                <a className="primary-button" href={theme.previewUrl} target="_blank" rel="noreferrer">
                  Open live demo <ExternalLink size={14} />
                </a>
              </div>
            )}

            <iframe
              key={theme.previewUrl}
              src={theme.previewUrl}
              title={`${theme.name} live preview`}
              loading="eager"
              allow="fullscreen"
              // minimal sandbox to keep preview functional; allow scripts/same-origin for most themes
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setIframeLoaded(true)}
              onError={() => setIframeError(true)}
              style={{ opacity: iframeLoaded && !iframeError ? 1 : 0 }}
            />

            {/* signal for manual fallback if site sets X-Frame-Options */}
            {!iframeError && iframeLoaded === false && (
              <button
                type="button"
                className="preview-blocked-hint"
                onClick={() => setIframeError(true)}
              >
                Not loading? Open in new tab
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex  justify-center text-xs py-2 border-t border-zinc-200" aria-hidden="true">
        <span>
          Viewing <strong>{theme.name}</strong> · {device} · {frameWidth}
        </span>

      </div>
    </div>
  );
}
