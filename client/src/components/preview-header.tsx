import { Link } from "react-router-dom";
import { ArrowLeft, LoaderCircle, Monitor, ShoppingBag, Smartphone, Tablet } from "lucide-react";
import type { ThemeType } from "../lib/types";
import { useCart } from "../context/cart-store";
import { useAppAuth } from "../context/auth-store";
import { money } from "../lib/format";

export type PreviewDevice = "mobile" | "tablet" | "desktop";

const DEVICE_META: Record<PreviewDevice, { label: string; width: string; icon: typeof Smartphone }> = {
  mobile: { label: "Mobile", width: "375px", icon: Smartphone },
  tablet: { label: "Tablet", width: "768px", icon: Tablet },
  desktop: { label: "Desktop", width: "100%", icon: Monitor },
};

export const PREVIEW_DEVICES: Array<{ id: PreviewDevice; label: string; width: string }> = (Object.keys(DEVICE_META) as PreviewDevice[]).map((id) => ({
  id,
  label: DEVICE_META[id].label,
  width: DEVICE_META[id].width,
}));

interface PreviewHeaderProps {
  theme: ThemeType;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  onCheckout: () => void;
}

export function PreviewHeader({ theme, device, onDeviceChange, onCheckout }: PreviewHeaderProps) {
  const cart = useCart();
  const { user } = useAppAuth();

  const inCart = cart.cart?.items.some((item) => item.themeId === theme.id) ?? false;
  const isAdmin = user?.role === "admin";
  const canPurchase = theme.canPurchase !== false;

  let checkoutLabel: string = "Buy now";
  let checkoutDisabled = false;
  let checkoutVariant: "primary" | "secondary" = "primary";

  if (theme.purchased) {
    checkoutLabel = "Owned — Open library";
    checkoutVariant = "secondary";
  } else if (isAdmin) {
    checkoutLabel = "Admin — no checkout";
    checkoutDisabled = true;
  } else if (!canPurchase) {
    checkoutLabel = "Coming soon";
    checkoutDisabled = true;
  } else if (inCart) {
    checkoutLabel = "View cart";
    checkoutVariant = "secondary";
  } else if (!user) {
    checkoutLabel = `Buy ${money(theme.priceMinor, theme.currency)}`;
  } else {
    checkoutLabel = `Buy ${money(theme.priceMinor, theme.currency)}`;
  }

  return (
    <header className="preview-header" role="banner">
      <div className="preview-header-left">
        <Link to={`/themes/${theme.slug}`} className="preview-back-link" aria-label={`Back to ${theme.name} details`}>
          <ArrowLeft size={16} />
          <span className="preview-back-text">Back</span>
          <span className="preview-back-sep">·</span>
          <span className="preview-theme-name">{theme.name}</span>
        </Link>

      </div>

      <div className="preview-device-switch" role="group" aria-label="Preview device size">
        {(Object.keys(DEVICE_META) as PreviewDevice[]).map((id) => {
          const meta = DEVICE_META[id];
          const Icon = meta.icon;
          const active = device === id;
          return (
            <button
              key={id}
              type="button"
              className={`preview-device-btn ${active ? "active" : ""}`}
              aria-pressed={active}
              aria-label={`Switch to ${meta.label} view (${meta.width})`}
              onClick={() => onDeviceChange(id)}
            >
              <Icon size={15} />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="preview-header-right">
        <span className="preview-price" aria-label={`Price ${money(theme.priceMinor, theme.currency)}`}>
          {money(theme.priceMinor, theme.currency)}
        </span>
        {theme.purchased ? (
          <Link to="/purchases" className="secondary-button preview-cta">
            Owned
          </Link>
        ) : isAdmin ? null : (
          <button
            type="button"
            className={`${checkoutVariant === "primary" ? "primary-button" : "secondary-button"} preview-cta`}
            disabled={checkoutDisabled || cart.isLoading}
            aria-busy={cart.isLoading}
            onClick={onCheckout}
          >
            {cart.isLoading ? <LoaderCircle size={16} className="preview-cta-loading" /> : <ShoppingBag size={16} />}
            <span>{inCart && !theme.purchased && canPurchase && !isAdmin ? "View cart" : checkoutLabel}</span>
          </button>
        )}
        {/* always show external fallback on small screens */}
      </div>
    </header>
  );
}
