/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PaginatedResponse, ThemeType, ThemeStatus } from "../../lib/types";
import { Edit3, Eye, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/admin/page-header";
import { ErrorMessage } from "../../components/ui/error-message";
import { TableSkeleton } from "../../components/ui/skeleton";
import { useToast } from "../../context/toast-store";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { ErrorState } from "../error/error";

export default function AdminThemesPage() {
  const [filters, setFilters] = useState({ search: "", status: "", page: 1 });
  const [draft, setDraft] = useState("");
  const request = useAsync<PaginatedResponse<ThemeType>>();
  const action = useAsync<unknown>();
  const { notify } = useToast();
  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(filters.page), pageSize: "12" });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    return request.run(api.get(`/admin/themes?${params}`)).catch(() => undefined);
  }, [filters, request.run]);

  useEffect(() => { void load(); }, [load]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFilters((value) => ({ ...value, search: draft, page: 1 }));
  };

  const mutate = async (promise: Promise<unknown>, message: string) => {
    try {
      await action.run(promise);
      notify(message);
      await load();
    } catch {
      return;
    }
  };

  if (request.error) return <ErrorState
    title="We couldn’t load the theme catalog"
    message={request.error}
    onRetry={() => void load()}
    retryLabel="Reload themes"
    backTo="/dashboard/insights"
    backLabel="Back to insights"
  />;

  return <main className="admin-page">
    <PageHeader eyebrow="Catalog" title="Portfolio themes" description="Create, preview, publish, and safely archive every template in your marketplace." actions={<Link className="primary-button" to="/dashboard/themes/new"><Plus size={17} />New theme</Link>} />
    {action.error && <ErrorMessage message={action.error} onDismiss={action.clearError} />}
    <section className="panel data-panel">
      <div className="filters-row">
        <form className="search-box" onSubmit={submit}><Search size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search themes" /><button>Search</button></form>
        <select value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value, page: 1 }))}>
          <option value="">Every status</option>
          {(["draft", "published", "archived"] as ThemeStatus[]).map((status) => <option key={status}>{status}</option>)}
        </select>
      </div>
      {request.isLoading && !request.data ? <TableSkeleton columns={6} /> : !request.data?.items.length ? <div className="empty-state">No themes match these filters.</div> : <div className="table-scroll">
        <table>
          <thead><tr><th>Theme</th><th>Stack</th><th>Price</th><th>Sales</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{request.data.items.map((theme) => <tr key={theme.id}>
            <td><div className="theme-admin-cell"><span>{theme.name.slice(0, 2).toUpperCase()}</span><div><strong>{theme.name}</strong><small>v{theme.version}</small>{theme.status === "draft" && theme.canPublish === false && <small className="publish-requirements">Missing: {theme.missingPublishRequirements?.join(", ")}</small>}</div></div></td>
            <td>{theme.stack.slice(0, 2).join(", ") || "—"}</td>
            <td>{money(theme.priceMinor, theme.currency)}</td>
            <td>{theme.salesCount ?? 0}</td>
            <td><span className={`status-pill ${theme.status === "published" ? "active" : theme.status === "archived" ? "blocked" : "pending"}`}>{theme.status}</span></td>
            <td><div className="row-actions">
              {theme.status === "published" ? <Link className="icon-button" to={`/themes/${theme.slug}`} aria-label={`View ${theme.name}`}><Eye size={17} /></Link> : <button className="icon-button" disabled title="Publish this theme before viewing its public page" aria-label={`View unavailable for draft theme ${theme.name}`}><Eye size={17} /></button>}
              <Link className="icon-button" to={`/dashboard/themes/${theme.id}/edit`} aria-label="Edit"><Edit3 size={17} /></Link>
              {theme.status !== "archived" && <button className="icon-button" disabled={action.isLoading || (theme.status !== "published" && theme.canPublish === false)} title={theme.status !== "published" && theme.missingPublishRequirements?.length ? `Missing: ${theme.missingPublishRequirements.join(", ")}` : undefined} onClick={() => void mutate(api.post(`/admin/themes/${theme.id}/publish`, { published: theme.status !== "published" }), theme.status === "published" ? "Theme returned to draft" : "Theme published")}>{theme.status === "published" ? "Unpublish" : "Publish"}</button>}
              <button className="icon-button danger" aria-label="Delete or archive" onClick={() => { if (window.confirm("Delete this unsold theme, or archive it if it has sales?")) void mutate(api.delete(`/admin/themes/${theme.id}`), "Theme removed from the live catalog"); }}><Trash2 size={17} /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {request.data && <div className="pagination"><span>{request.data.total} themes</span><div>
        <button disabled={filters.page <= 1} onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}>Previous</button>
        <span>Page {request.data.page} of {request.data.pages}</span>
        <button disabled={filters.page >= request.data.pages} onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}>Next</button>
      </div></div>}
    </section>
  </main>;
}
