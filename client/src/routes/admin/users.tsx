import { Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { IUser, PaginatedResponse, UserProvider, UserRole, UserStatus } from "../../lib/types";
import { PageHeader } from "../../components/admin/page-header";
import { ErrorMessage } from "../../components/ui/error-message";
import { TableSkeleton } from "../../components/ui/skeleton";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { money } from "../../lib/format";

interface UserRow extends IUser {
  totalOrders: number;
  spentByCurrency: Array<{ currency: string; amountMinor: number }>;
}
type UserPage = PaginatedResponse<UserRow>;

export default function UsersPage() {
  const [filters, setFilters] = useState({ search: "", provider: "", status: "", role: "", page: 1 });
  const [draftSearch, setDraftSearch] = useState("");
  const [notice, setNotice] = useState("");
  const { data, error, isLoading, run, clearError } = useAsync<UserPage>();
  const action = useAsync<unknown>();

  const load = useCallback(() => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: "10" });
    Object.entries(filters).forEach(([key, value]) => { if (key !== "page" && value) query.set(key, String(value)); });
    return run(api.get<UserPage>(`/admin/users?${query}`)).catch(() => undefined);
  }, [filters, run]);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (request: Promise<unknown>, success: string) => {
    try { await action.run(request); setNotice(success); await load(); } catch { return; }
  };
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setFilters((current) => ({ ...current, search: draftSearch, page: 1 })); };

  return (
    <main className="admin-page">
      <PageHeader eyebrow="Customers" title="Manage users" description="Search accounts, control access, assign roles, and review customer value." />
      {(error || action.error) && <ErrorMessage message={(error || action.error)!} onDismiss={() => { clearError(); action.clearError(); }} />}
      {notice && <div className="success-message" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
      <section className="panel data-panel">
        <div className="filters-row">
          <form className="search-box" onSubmit={submitSearch}><Search size={18} /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search name or email" aria-label="Search users" /><button type="submit">Search</button></form>
          <div className="filter-group"><SlidersHorizontal size={18} aria-hidden="true" />
            <select value={filters.provider} onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value, page: 1 }))} aria-label="Provider filter"><option value="">All providers</option>{(["email", "google", "github", "microsoft", "apple"] as UserProvider[]).map((value) => <option value={value} key={value}>{value}</option>)}</select>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))} aria-label="Status filter"><option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option></select>
            <select value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value, page: 1 }))} aria-label="Role filter"><option value="">All roles</option><option value="admin">Admin</option><option value="customer">Customer</option></select>
          </div>
        </div>
        {isLoading && !data ? <TableSkeleton columns={7} /> : !data?.items.length ? <div className="empty-state">No users match these filters.</div> : <div className="table-scroll"><table>
          <thead><tr><th>User</th><th>Provider</th><th>Role</th><th>Status</th><th>Total spent</th><th>Orders</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.items.map((user) => <tr key={user.id}>
            <td><div className="user-cell">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="avatar-fallback">{user.name.slice(0, 1)}</span>}<div><strong>{user.name}</strong><small>{user.email}</small></div></div></td>
            <td><span className="provider-label">{user.provider}</span></td>
            <td><select className="table-select" value={user.role} onChange={(event) => void mutate(api.patch(`/admin/users/${user.id}/role`, { role: event.target.value as UserRole }), "Role updated") } disabled={action.isLoading}><option value="customer">Customer</option><option value="admin">Admin</option></select></td>
            <td><button className={`status-pill ${user.status}`} onClick={() => void mutate(api.patch(`/admin/users/${user.id}/status`, { status: (user.status === "active" ? "blocked" : "active") as UserStatus }), `Account ${user.status === "active" ? "blocked" : "activated"}`)} disabled={action.isLoading}>{user.status}</button></td>
            <td><div className="user-spend">{user.spentByCurrency.length ? user.spentByCurrency.map((spend) => <strong key={spend.currency}>{money(spend.amountMinor, spend.currency)}</strong>) : <strong>{money(0)}</strong>}<small>Paid orders</small></div></td>
            <td><strong className="order-count">{user.totalOrders}</strong></td>
            <td><button className="icon-button danger" onClick={() => { if (window.confirm(`Remove ${user.name}'s access? Financial order history will be retained.`)) void mutate(api.delete(`/admin/users/${user.id}`), "User access removed"); }} aria-label={`Delete ${user.name}`} disabled={action.isLoading}><Trash2 size={17} /></button></td>
          </tr>)}</tbody>
        </table></div>}
        {data && <div className="pagination"><span>{data.total} users</span><div><button disabled={filters.page <= 1 || isLoading} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {data.page} of {data.pages}</span><button disabled={filters.page >= data.pages || isLoading} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div></div>}
      </section>
    </main>
  );
}
