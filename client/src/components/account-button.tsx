import { LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppAuth } from "../context/auth-store";

export function AccountButton() {
  const { user, logout } = useAppAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const initials = user?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  const avatarUrl = user?.avatarUrl;
  const showAvatar = Boolean(avatarUrl && failedAvatarUrl !== avatarUrl);

  return <div className="account-menu" ref={rootRef}>
    <button
      type="button"
      className="account-trigger"
      aria-label="Open account menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      {showAvatar ? <img
        src={avatarUrl}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedAvatarUrl(avatarUrl ?? null)}
      /> : <span aria-hidden="true">{initials}</span>}
    </button>
    <div className={`account-popover ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="account-identity">
        <UserRound size={17} />
        <span><strong>{user?.name}</strong><small>{user?.email}</small></span>
      </div>
      <button type="button" onClick={async () => {
        await logout();
        setOpen(false);
        navigate("/");
      }}>
        <LogOut size={16} />
        <span>Sign out</span>
      </button>
    </div>
  </div>;
}
