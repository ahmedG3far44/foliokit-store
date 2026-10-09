import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAppAuth } from "../../context/auth-store";
import {
  CreditCard,
  Menu,
  Users,
  X,
  ShoppingBag,
  LayoutPanelTop,
  ChartSpline,
  FileText,
  MailPlus,
  SquarePercent,
  ChartBarStacked,
} from "lucide-react";
import { Logo } from "../header";
import { AccountButton } from "../account-button";

const navigation = [
  {
    to: "/dashboard/insights",
    label: "Admin Insights",
    icon: ChartSpline,
    end: true,
  },
  { to: "/dashboard/users", label: "Manage users", icon: Users },
  {
    to: "/dashboard/categories",
    label: "Manage categories",
    icon: ChartBarStacked,
  },
  { to: "/dashboard/themes", label: "Theme templates", icon: LayoutPanelTop },
  { to: "/dashboard/orders", label: "Manage orders", icon: ShoppingBag },
  {
    to: "/dashboard/discounts",
    label: "Discounts coupons",
    icon: SquarePercent,
  },
  { to: "/dashboard/promotions", label: "Promotions emails", icon: MailPlus },
  {
    to: "/dashboard/transactions",
    label: "All Transactions",
    icon: CreditCard,
  },
  { to: "/dashboard/content", label: "Manage content", icon: FileText },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAppAuth();

  return (
    <div className="admin-shell">
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${open ? "is-open" : ""}`}>
        <div className="brand-row">
          <Logo />
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <p className="sidebar-label">Administration</p>
        <nav aria-label="Admin navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <AccountButton />
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
      </aside>
      <div className="admin-main">
        <header className="mobile-header">
          <button
            className="icon-button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>
          <span className="brand">
            PORTFOLIO <b>MARKET</b>
          </span>
          <AccountButton />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
