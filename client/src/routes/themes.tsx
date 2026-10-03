/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { CatalogResponse } from "../lib/types";
import { Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Header from "../components/header";
import { ThemeCard } from "../components/theme-card";
import { ErrorState } from "./error/error";
import { Skeleton } from "../components/ui/skeleton";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

export default function ThemesPage() {
  const [filters, setFilters] = useState({ search: "", stack: "", sort: "newest", page: 1 });
  const [draft, setDraft] = useState("");
  const { user } = useAppAuth();
  const cart = useCart();
  const request = useAsync<CatalogResponse>();
  const load = useCallback(() => {
    const params = new URLSearchParams({ sort: filters.sort, page: String(filters.page), limit: "12" });
    if (filters.search) params.set("search", filters.search);
    if (filters.stack) params.set("stack", filters.stack);
    return request.run(api.get<CatalogResponse>(`/themes?${params}`)).catch(() => undefined);
  }, [filters, request.run]);

  useEffect(() => { void load(); }, [load]);
  const search = (event: FormEvent) => { event.preventDefault(); setFilters((value) => ({ ...value, search: draft, page: 1 })); };

  if (request.error) return <ErrorState
    title="We couldn’t load the theme library"
    message={request.error}
    onRetry={() => void load()}
    retryLabel="Reload themes"
    backTo="/"
    backLabel="Back to home"
  />;

  return <div className="store-page">
    <Header />
    <main className="catalog-page">
      <div className="catalog-heading"><span className="eyebrow">Theme library</span><h1>Find your portfolio’s point of view.</h1><p>Explore responsive templates built for designers, developers, studios, and independent creators.</p></div>
      <div className="catalog-toolbar">
        <form onSubmit={search} className="search-box"><Search size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search themes or technology" /><button>Search</button></form>
        <div className="filter-group">
          <SlidersHorizontal size={18} />
          <select value={filters.stack} onChange={(event) => setFilters((value) => ({ ...value, stack: event.target.value, page: 1 }))}><option value="">All stacks</option>{request.data?.stacks.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value, page: 1 }))}><option value="newest">Newest</option><option value="popular">Most popular</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
        </div>
      </div>
      {request.isLoading && !request.data ? (
        <div className="theme-grid">{[1, 2, 3, 4, 5, 6].map((number) => <Skeleton className="theme-card-skeleton" key={number} />)}</div>
      ) : request.data?.items.length ? <>
        <div className="theme-grid">{request.data.items.map((theme) => <ThemeCard
          key={theme.id}
          theme={theme}
          inCart={cart.cart?.items.some((item) => item.themeId === theme.id)}
          isAdmin={user?.role === "admin"}
          onAdd={user && user.role !== "admin" ? (id) => void cart.add(id).catch(() => undefined) : undefined}
          adding={cart.isLoading}
        />)}</div>
        <div className="catalog-pagination"><button disabled={filters.page === 1} onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}>Previous</button><span>Page {request.data.page} of {request.data.pages}</span><button disabled={filters.page >= request.data.pages} onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}>Next</button></div>
      </> : <div className="catalog-empty">No themes match those filters.</div>}
    </main>
  </div>;
}
