import { ArrowDownRight, ArrowUpRight, DollarSign, ShoppingBag, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../hooks/use-async";
import { ErrorMessage } from "../../components/ui/error-message";
import { Skeleton } from "../../components/ui/skeleton";
import { PageHeader } from "../../components/admin/page-header";

type Period = "day" | "week" | "month" | "six_months" | "year";
type FilterPeriod = Period | "custom";
interface InsightsData {
  totalUsers: number; newUsers: number; revenueMinor: number; totalSales: number;
  sales: Array<{ label: string; revenueMinor: number; sales: number; orders: number }>;
  viralThemes: Array<{ id: string; name: string; sales: number; revenueMinor: number }>;
}

const periods: Array<{ value: FilterPeriod; label: string }> = [
  { value: "day", label: "Today" }, { value: "week", label: "7 days" }, { value: "month", label: "30 days" },
  { value: "six_months", label: "6 months" }, { value: "year", label: "1 year" }, { value: "custom", label: "Pick range" },
];
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function todayInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function SalesChart({ values }: { values: InsightsData["sales"] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(...values.map((item) => item.revenueMinor), 1);
  const coordinates = values.map((item, index) => ({
    x: (index / Math.max(values.length - 1, 1)) * 100,
    y: 30 - (item.revenueMinor / max) * 27,
  }));
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const hoveredItem = hoveredIndex === null ? null : values[hoveredIndex];
  const hoveredPoint = hoveredIndex === null ? null : coordinates[hoveredIndex];

  const selectNearestPoint = (clientX: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    setHoveredIndex(Math.round(progress * Math.max(values.length - 1, 0)));
  };

  return (
    <div className="chart-wrap">
      <div
        className="chart-canvas"
        role="group"
        tabIndex={0}
        aria-label={hoveredItem ? `${hoveredItem.label}: ${hoveredItem.orders} ${hoveredItem.orders === 1 ? "order" : "orders"}` : "Revenue over time. Hover or use the arrow keys to inspect order counts."}
        onPointerMove={(event) => selectNearestPoint(event.clientX, event.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
        onFocus={() => setHoveredIndex((current) => current ?? 0)}
        onBlur={() => setHoveredIndex(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          setHoveredIndex((current) => Math.min(values.length - 1, Math.max(0, (current ?? 0) + direction)));
        }}
      >
        <svg viewBox="0 0 100 32" aria-hidden="true" focusable="false" preserveAspectRatio="none">
          <line x1="0" y1="30" x2="100" y2="30" className="chart-grid" />
          <line x1="0" y1="16" x2="100" y2="16" className="chart-grid" />
          <polyline points={points} className="chart-line" vectorEffect="non-scaling-stroke" />
          {hoveredPoint && <>
            <line x1={hoveredPoint.x} y1="2" x2={hoveredPoint.x} y2="30" className="chart-hover-line" vectorEffect="non-scaling-stroke" />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="0.8" className="chart-hover-point" vectorEffect="non-scaling-stroke" />
          </>}
        </svg>
        {hoveredItem && hoveredPoint && <div
          className={`chart-tooltip ${hoveredPoint.x < 12 ? "is-left" : hoveredPoint.x > 88 ? "is-right" : ""}`}
          style={{ left: `${hoveredPoint.x}%`, top: `${Math.max(hoveredPoint.y / 32 * 100, 14)}%` }}
        >
          <strong>{hoveredItem.label}</strong>
          <span>{hoveredItem.orders} {hoveredItem.orders === 1 ? "order" : "orders"}</span>
        </div>}
      </div>
      <div className="chart-labels">{values.filter((_, index) => index % Math.max(1, Math.ceil(values.length / 6)) === 0).map((item) => <span key={item.label}>{item.label}</span>)}</div>
    </div>
  );
}

export default function InsightsPage() {
  const [period, setPeriod] = useState<FilterPeriod>("day");
  const [range, setRange] = useState(() => {
    const today = todayInputValue();
    return { from: today, to: today };
  });
  const { data, error, isLoading, run, clearError } = useAsync<InsightsData>();
  useEffect(() => {
    const query = new URLSearchParams({ period: period === "custom" ? "month" : period });
    if (period === "custom") {
      if (!range.from || !range.to || range.from > range.to) return;
      query.set("from", range.from);
      query.set("to", range.to);
    }
    void run(api.get<InsightsData>(`/admin/analytics?${query}`)).catch(() => undefined);
  }, [period, range.from, range.to, run]);
  const cards = useMemo(() => [
    { label: "Revenue", value: money.format((data?.revenueMinor ?? 0) / 100), detail: "paid marketplace orders", icon: DollarSign, positive: true },
    { label: "Total sales", value: String(data?.totalSales ?? 0), detail: "completed purchases", icon: ShoppingBag, positive: true },
    { label: "Total users", value: String(data?.totalUsers ?? 0), detail: "registered accounts", icon: Users, positive: true },
    { label: "New users", value: String(data?.newUsers ?? 0), detail: "in the last 30 days", icon: Sparkles, positive: (data?.newUsers ?? 0) > 0 },
  ], [data]);

  return (
    <main className="admin-page">
      <PageHeader eyebrow="Overview" title="Business insights" description="Track revenue, customer growth, and the plans driving your business." actions={
        <div className="insight-filters">
          <select value={period} onChange={(event) => setPeriod(event.target.value as FilterPeriod)} aria-label="Insight period">
            {periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {period === "custom" ? <>
            <input type="date" aria-label="Custom range start" max={range.to || undefined} value={range.from} onChange={(event) => setRange((value) => ({ ...value, from: event.target.value }))} />
            <input type="date" aria-label="Custom range end" min={range.from || undefined} value={range.to} onChange={(event) => setRange((value) => ({ ...value, to: event.target.value }))} />
          </> : null}
        </div>
      } />
      {error && <ErrorMessage message={error} onDismiss={clearError} />}
      <section className="metric-grid" aria-label="Key metrics">
        {cards.map(({ label, value, detail, icon: Icon, positive }) => <article className="metric-card" key={label}>
          <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div>
          {isLoading && !data ? <Skeleton className="metric-skeleton" /> : <strong>{value}</strong>}
          <small className={positive ? "positive" : "muted"}>{positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{detail}</small>
        </article>)}
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><h2>Revenue performance</h2><p>Successful payment volume for the selected period.</p></div></div>
          {isLoading && !data ? <Skeleton className="chart-skeleton" /> : data?.sales.length ? <SalesChart values={data.sales} /> : <div className="empty-state">No successful transactions in this period.</div>}
        </article>
        <article className="panel viral-panel">
          <div className="panel-heading"><div><h2>Viral themes</h2><p>Most purchased portfolio templates overall.</p></div></div>
          {isLoading && !data ? <Skeleton className="list-skeleton" /> : data?.viralThemes.length ? <ol className="rank-list">{data.viralThemes.map((theme, index) => <li key={theme.id}><span className="rank">{index + 1}</span><div><strong>{theme.name}</strong><small>{theme.sales} sales</small></div><b>{money.format(theme.revenueMinor / 100)}</b></li>)}</ol> : <div className="empty-state compact">Theme rankings appear after the first sale.</div>}
        </article>
      </section>
    </main>
  );
}
