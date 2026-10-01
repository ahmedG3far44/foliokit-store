/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { IUser, OrderStatus, OrderType, PaginatedResponse } from "@shared/types";
import { Eye, Search } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/admin/page-header";
import { TableSkeleton } from "../../components/ui/skeleton";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { dateTime, money } from "../../lib/format";
import { ErrorState } from "../error/error";

interface AdminOrder extends OrderType {
  user: Pick<IUser, "name" | "email" | "avatarUrl">;
}

export default function AdminOrdersPage() {
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "", page: 1 });
  const [draft, setDraft] = useState("");
  const request = useAsync<PaginatedResponse<AdminOrder>>();
  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(filters.page), pageSize: "15" });
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== "page" && value) params.set(key, String(value));
    });
    return request.run(api.get(`/admin/orders?${params}`)).catch(() => undefined);
  }, [filters, request.run]);

  useEffect(() => { void load(); }, [load]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFilters((value) => ({ ...value, search: draft, page: 1 }));
  };

  if (request.error) return <ErrorState
    title="We couldn’t load marketplace orders"
    message={request.error}
    onRetry={() => void load()}
    retryLabel="Reload orders"
    backTo="/dashboard/insights"
    backLabel="Back to insights"
  />;

  return <main className="admin-page">
    <PageHeader eyebrow="Commerce" title="Marketplace orders" description="Review payment state, immutable order totals, customers, and the exact themes sold." />
    <section className="panel data-panel orders-list-panel">
      <div className="filters-row">
        <form className="search-box" onSubmit={search}>
          <Search size={18} />
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Order number, name, or email" />
          <button>Search</button>
        </form>
        <div className="filter-group">
          <select value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value, page: 1 }))}>
            <option value="">Every status</option>
            {(["pending", "paid", "failed", "refunded"] as OrderStatus[]).map((status) => <option key={status}>{status}</option>)}
          </select>
          <input type="date" aria-label="From date" value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value, page: 1 }))} />
          <input type="date" aria-label="To date" value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value, page: 1 }))} />
        </div>
      </div>
      {request.isLoading && !request.data ? <TableSkeleton columns={6} /> : !request.data?.items.length ? <div className="empty-state">No orders match this view.</div> : <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {request.data.items.map((order) => <tr key={order.id}>
              <td>
                <strong>{order.orderNumber}</strong>
              </td>
              <td>
                <div className="user-cell">
                  <span className="avatar-fallback">{order.user?.name?.slice(0, 1) ?? "?"}</span>
                  <div>
                    <strong>{order.user?.name ?? "Deleted user"}</strong>
                    <small>{order.user?.email}</small>
                  </div>
                </div>
              </td>
              <td>{order.items.length}</td>
              <td>
                <strong>{money(order.totalMinor, order.currency)}</strong>
              </td>
              <td><span className={`status-pill ${order.status === "paid" ? "active" : order.status === "pending" ? "pending" : "blocked"}`}>{order.status}</span></td>
              <td>
                {dateTime(order.createdAt)}
              </td>
              <td>
                <Link className="icon-button" to={`/dashboard/orders/${order.id}`} aria-label="View order"><Eye size={17} /></Link>
              </td>
            </tr>
            )}
          </tbody>
        </table>
      </div>
      }
      {request.data && <div className="pagination"><span>{request.data.total} orders</span><div>
        <button disabled={filters.page <= 1} onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}>Previous</button>
        <span>Page {request.data.page} of {request.data.pages}</span>
        <button disabled={filters.page >= request.data.pages} onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}>Next</button>
      </div></div>}
    </section>
  </main>;
}
