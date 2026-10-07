import { money } from "../lib/format";
import { Link, useNavigate } from "react-router-dom";
import { useRef } from "react";
import { ThemeMedia } from "./theme-media";
import { themePreview } from "../lib/theme-media";
import { Eye, FileDown, LoaderCircle, ShoppingBag, ShoppingCart } from "lucide-react";

import type { ThemeType } from "../lib/types";

interface ThemeCardProps {
  theme: ThemeType;
  inCart?: boolean;
  isAdmin?: boolean;
  onAdd?: (id: string) => void;
  adding?: boolean;
}


const actionBase =
  "inline-flex min-h-8 min-w-[112px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-medium leading-none text-neutral-800 transition-all duration-150 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export function ThemeCard({ theme, inCart = false, isAdmin = false, onAdd, adding = false }: ThemeCardProps) {

  const navigate = useNavigate();
  const previewRef = useRef<HTMLDivElement>(null);

  const startPreview = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const video = previewRef.current?.querySelector("video");
    if (video) void video.play().catch(() => undefined);
  };

  const stopPreview = () => {
    const video = previewRef.current?.querySelector("video");
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  const purchaseAction = theme.purchased ? (
    <Link className={actionBase} to="/purchases" aria-label={`Download ${theme.name}`}>
      <FileDown size={14} strokeWidth={2.25} />
      Download
    </Link>
  ) : inCart ? (
    <Link className={actionBase} to="/cart">
      <ShoppingCart size={14} strokeWidth={2.25} />
      View cart
    </Link>
  ) : isAdmin ? null : theme.canPurchase === false ? (
    <button className={actionBase} type="button" disabled title="Download package coming soon">
      <ShoppingBag size={14} strokeWidth={2.25} />
      Coming soon
    </button>
  ) : onAdd ? (
    <button
      className={actionBase}
      type="button"
      disabled={adding}
      aria-busy={adding}
      onClick={() => onAdd(theme.id)}
    >
      {adding ? <LoaderCircle className="animate-spin" size={14} strokeWidth={2.25} /> : <ShoppingBag size={14} strokeWidth={2.25} />}
      {adding ? "Adding…" : "Add to cart"}
    </button>
  ) : (
    <Link className={actionBase} to="/sign-in">
      <ShoppingBag size={14} strokeWidth={2.25} />
      Add to cart
    </Link>
  );

  void theme.stack;

  // make the card link to the preview page
  // TODO: make it open in a modal
  console.log("theme", theme);
  
  return (
    <article className="group overflow-hidden rounded-2xl bg-transparent">
      <div
        ref={previewRef}
        onMouseEnter={startPreview}
        onMouseLeave={stopPreview}
        className="relative block aspect-[6/5] w-full overflow-hidden rounded-2xl">

        <button
          type="button"
          aria-label={`Preview ${theme.name}`}
          onClick={() => navigate(`/themes/${theme.slug}/preview`)}
          className="theme-preview-action opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        >
          <span className="theme-preview-tooltip" aria-hidden="true">Preview</span>
          <Eye size={18} strokeWidth={2.15} />
        </button>

        <Link className="block h-full w-full cursor-pointer" to={`/themes/${theme.slug}/preview`} aria-label={`Open ${theme.name} preview`}>
          <ThemeMedia
            asset={themePreview(theme)}
            alt={`Preview of ${theme.name}`}
            preview
            autoPlay={false}
            loading="eager"
            className="h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-3">

        <div className="min-w-0">
          <h3 className="truncate">
            <Link
              className="text-[15px] font-semibold leading-tight text-neutral-900 hover:text-neutral-600 hover:underline"
              to={`/themes/${theme.slug}`}
            >
              {theme.name}
            </Link>
          </h3>
          <span className="text-[13px] font-medium tracking-tight text-neutral-500">
            {money(theme.priceMinor, theme.currency)}
          </span>
        </div>

        {purchaseAction}
      </div>
    </article>
  );
}
