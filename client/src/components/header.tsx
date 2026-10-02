import { ArrowLeftRight, ChevronDown, LayoutDashboardIcon, LayoutTemplate, LibraryBig, Menu, PackageCheck, ReceiptText, ShoppingBag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { AccountButton } from "./account-button";

const libraryLinks = [
  { to: "/purchase", label: "Purchases", description: "Themes you own", icon: PackageCheck },
  { to: "/orders", label: "Orders", description: "Receipts and details", icon: ReceiptText },
  { to: "/transactions", label: "Transactions", description: "Pending payment activity", icon: ArrowLeftRight },
];

function Header() {
  const { count } = useCart();
  const { user, isReady } = useAppAuth();

  const location = useLocation();

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openedAtPath, setOpenedAtPath] = useState(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileOpenedAtPath, setMobileOpenedAtPath] = useState(location.pathname);

  const headerRef = useRef<HTMLElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  const menuOpen = libraryOpen && openedAtPath === location.pathname;
  const mobileMenuOpen = mobileOpen && mobileOpenedAtPath === location.pathname;

  const libraryActive = location.pathname === "/purchase"
    || location.pathname === "/purchases"
    || location.pathname.startsWith("/orders")
    || location.pathname.startsWith("/transactions");

  useEffect(() => {
    if (!menuOpen && !mobileMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!headerRef.current?.contains(target)) {
        setLibraryOpen(false);
        setMobileOpen(false);
      } else if (menuOpen && !libraryRef.current?.contains(target)) {
        setLibraryOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLibraryOpen(false);
      setMobileOpen(false);
      if (mobileMenuOpen) mobileTriggerRef.current?.focus();
      else triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, mobileMenuOpen]);

  const isHomePage = location.pathname === "/";



  return <header ref={headerRef} className={`site-header ${isHomePage ? "home-header" : ""}`}>
    <Logo />
    {isReady ? <>

      <nav className="main-nav" aria-label="Main navigation">
        <NavLink className={({ isActive }) => `site-nav-link ${isActive ? "active" : ""}`} to="/themes">
          <LayoutTemplate size={17} strokeWidth={1.9} />
          <span>Themes</span>
        </NavLink>

        {user && <>
          {user?.role === "customer" && <div className="library-nav" ref={libraryRef}>
            <button
              ref={triggerRef}
              type="button"
              className={`library-menu-trigger ${libraryActive ? "active" : ""}`}
              aria-controls="header-library-menu"
              aria-expanded={menuOpen}
              onClick={() => {
                setMobileOpen(false);
                if (menuOpen) setLibraryOpen(false);
                else {
                  setOpenedAtPath(location.pathname);
                  setLibraryOpen(true);
                }
              }}
            >
              <LibraryBig size={17} strokeWidth={1.9} />
              <span>Library</span>
              <ChevronDown className={menuOpen ? "is-open" : ""} size={14} />
            </button>

            <div id="header-library-menu" className={`header-library-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
              <div className="header-library-menu-label">Your account</div>
              {libraryLinks.map(({ to, label, description, icon: Icon }) => <NavLink
                key={to}
                to={to}
                tabIndex={menuOpen ? 0 : -1}
                className={({ isActive }) => isActive ? "active" : ""}
                onClick={() => setLibraryOpen(false)}
              >
                <span className="header-library-menu-icon"><Icon size={17} strokeWidth={1.9} /></span>
                <span><strong>{label}</strong><small>{description}</small></span>
              </NavLink>)}
            </div>
          </div>}
          {user?.role === "admin" && <NavLink className={({ isActive }) => `site-nav-link nav-admin-link ${isActive ? "active" : ""}`} to="/dashboard/insights">
            <LayoutDashboardIcon size={18} strokeWidth={1.9} />
            <span>Dashboard</span>
          </NavLink>}
        </>}
      </nav>

      <div className="auth-actions">
        {!user && <>
          <Link className="text-button" to="/sign-in">Sign in</Link>
          <Link className="primary-button small" to="/sign-up">Create account</Link>
        </>}

        {user && <>
          <AccountButton />
          {user?.role !== "admin" && <Link className="cart-link" to="/cart" aria-label={`Cart with ${count} items`}><ShoppingBag size={19} />{count > 0 && <span>{count}</span>}</Link>}
        </>}
        <button
          ref={mobileTriggerRef}
          type="button"
          className="mobile-menu-trigger"
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          aria-controls="mobile-site-navigation"
          aria-expanded={mobileMenuOpen}
          onClick={() => {
            setLibraryOpen(false);
            if (mobileMenuOpen) setMobileOpen(false);
            else {
              setMobileOpenedAtPath(location.pathname);
              setMobileOpen(true);
            }
          }}
        >
          {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      <nav
        id="mobile-site-navigation"
        className={`mobile-navigation ${mobileMenuOpen ? "is-open" : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileMenuOpen}
      >
        <NavLink tabIndex={mobileMenuOpen ? 0 : -1} className={({ isActive }) => isActive ? "active" : ""} to="/themes" onClick={() => setMobileOpen(false)}>
          <LayoutTemplate size={18} />
          <span><strong>Themes</strong><small>Browse portfolio templates</small></span>
        </NavLink>
        {user && <>
          {user?.role === "customer" && libraryLinks.map(({ to, label, description, icon: Icon }) => <NavLink
            key={to}
            tabIndex={mobileMenuOpen ? 0 : -1}
            className={({ isActive }) => isActive ? "active" : ""}
            to={to}
            onClick={() => setMobileOpen(false)}
          >
            <Icon size={18} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </NavLink>)}
          {user?.role === "admin" && <NavLink tabIndex={mobileMenuOpen ? 0 : -1} className={({ isActive }) => isActive ? "active" : ""} to="/dashboard/insights" onClick={() => setMobileOpen(false)}>
            <LayoutDashboardIcon size={18} />
            <span><strong>Dashboard</strong><small>Manage your marketplace</small></span>
          </NavLink>}
        </>}
        {!user && <>
          <div className="mobile-auth-links">
            <Link tabIndex={mobileMenuOpen ? 0 : -1} to="/sign-in" onClick={() => setMobileOpen(false)}>Sign in</Link>
            <Link tabIndex={mobileMenuOpen ? 0 : -1} to="/sign-up" onClick={() => setMobileOpen(false)}>Create account</Link>
          </div>
        </>}
      </nav></> : <Skeleton />}
  </header>;
}

export default Header;



export function Logo() {
  return (<Link className="text-white font-black font-sans text-xl leading-3 transition-all duration-200 ease-in-out hover:opacity-75" to="/">FOLIO <span className="text-brand">KIT</span></Link>)
}

export function Skeleton() {
  return (<div className="flex flex-row-reverse items-center gap-2 animate-pulse" >
    <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-600"></div>
    <div className="space-y-1">
      <div className="w-24 h-4 rounded ml-auto bg-neutral-100 dark:bg-neutral-600"></div>
      <div className="w-40 h-3 rounded bg-neutral-100 dark:bg-neutral-600"></div>
    </div>
  </div>)
}
