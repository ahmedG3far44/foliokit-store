import { dateTime } from "../lib/format";
import { Spinner } from "./ui/spinner";

import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Download, Ellipsis, LayoutDashboard, MonitorPlay, PackageOpen, ReceiptText } from "lucide-react";

import type { EntitlementType } from "@shared/types";
interface OwnedThemeCardProps {
  entitlement: EntitlementType;
  downloading?: boolean;
  onDownload: (entitlementId: string) => void;
}

export function OwnedThemeCard({ entitlement, downloading = false, onDownload }: OwnedThemeCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const theme = entitlement.theme;
  const downloadUnavailable = downloading || entitlement.status !== "active" || entitlement.downloadsUsed >= entitlement.downloadLimit;

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return <article className="purchase-card owned-theme-card">
    <div className="purchase-icon"><PackageOpen size={24} /></div>
    <div className="owned-theme-details">
      <span className={`status-pill ${entitlement.status === "active" ? "active" : "blocked"}`}>{entitlement.status}</span>
      <h2>{theme?.name ?? "Archived theme"}</h2>
      <p>Version {entitlement.purchasedVersion} · Purchased {dateTime(entitlement.purchasedAt)}</p>
    </div>
    <div className="download-meter">
      <div><span>Downloads used</span><strong>{entitlement.downloadsUsed} / {entitlement.downloadLimit}</strong></div>
      <progress value={entitlement.downloadsUsed} max={entitlement.downloadLimit} />
    </div>
    <button
      type="button"
      className="icon-button"
      aria-label={`Download ${theme?.name ?? "theme"} source code`}
      title="Download source code"
      disabled={downloadUnavailable}
      onClick={() => onDownload(entitlement.id)}
    >
      {downloading ? <Spinner size="sm" /> : <Download size={16} strokeWidth={2} />}
    </button>
    <div className="owned-theme-actions" ref={actionsRef}>

      <button
        ref={triggerRef}
        type="button"
        className="icon-button owned-theme-menu-trigger rotate-90"
        aria-label={`Actions for ${theme?.name ?? "archived theme"}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Ellipsis size={16} />
      </button>

      <div
        role="menu"
        aria-hidden={!menuOpen}
        className={`absolute right-0 top-full z-20 mt-2 w-72 origin-top-right rounded-xl border border-line bg-[var(--surface,#ffffff)] p-1.5 shadow-lg shadow-black/5 transition-all duration-150 ${menuOpen
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-1 scale-95 opacity-0"
          }`}
      >


        <MenuAction
          title="Download source code"
          desc={entitlement.downloadsUsed >= entitlement.downloadLimit ? "Download limit reached" : "Get the purchased ZIP package"}
          icon={downloading ? <Spinner size="sm" /> : <Download size={16} strokeWidth={2} />}
          menuOpen={menuOpen}
          closeMenu={closeMenu}
          disabled={downloadUnavailable}
          onSelect={() => onDownload(entitlement.id)}
        />
        {theme && (
          <>
            <MenuAction title="View order" desc="Open receipt & payment details" icon={<ReceiptText size={16} strokeWidth={2} />} to={`/orders/${entitlement.orderId}`} menuOpen={menuOpen} closeMenu={closeMenu} />
            <div className="border-t border-line my-1"></div>
            <MenuAction title="View theme" desc="Open the theme details" icon={<LayoutDashboard size={16} strokeWidth={2} />} to={`/themes/${theme.slug}`} menuOpen={menuOpen} closeMenu={closeMenu} />
            <MenuAction title="Preview demo" desc="Explore the live theme preview" icon={<MonitorPlay size={16} strokeWidth={2} />} to={`/themes/${theme.slug}/preview`} menuOpen={menuOpen} closeMenu={closeMenu} />

          </>
        )}
      </div>
    </div>
  </article>;
}



function MenuAction({ to, title, desc, icon, menuOpen, disabled = false, onSelect, closeMenu }: { to?: string, title: string, desc: string, icon: React.ReactNode, menuOpen: boolean, disabled?: boolean, onSelect?: () => void, closeMenu: () => void }) {
  const navigate = useNavigate();

  return <button
    type="button"
    role="menuitem"
    tabIndex={menuOpen ? 0 : -1}
    disabled={disabled}
    onClick={() => {
      closeMenu();
      if (onSelect) onSelect();
      else if (to) navigate(to);
    }}
    className="group flex items-center justify-start gap-3 hover:bg-zinc-100 transition-colors rounded-md w-full py-2 px-1 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full  group-hover:text-brand transition-colors ">

      {icon}

    </span>


    <span className="flex flex-col items-start ">
      <strong className="text-sm font-medium ">{title}</strong>
      <small className="text-[10px] leading-snug text-muted ">
        {desc}
      </small>
    </span>
  </button>
}
