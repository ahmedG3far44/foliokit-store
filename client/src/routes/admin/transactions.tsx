import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { useAsync } from "../../hooks/use-async";
import { useEffect, useState, type FormEvent } from "react";
import { TableSkeleton } from "../../components/ui/skeleton";
import { CalendarDays, HandCoins, Search } from "lucide-react";
import { PageHeader } from "../../components/admin/page-header";
import { ErrorMessage } from "../../components/ui/error-message";
import { PaymentProviderMark } from "../../components/payment-provider-mark";

import type { IUser, PaginatedResponse, PlanType, TransactionStatus, TransactionType } from "@shared/types";

type PopulatedTransaction = Omit<TransactionType, "userId" | "planId"> & { userId: Pick<IUser, "name" | "email" | "avatarUrl">; planId?: Pick<PlanType, "name" | "slug"> };
type TransactionPage = PaginatedResponse<PopulatedTransaction>;

export default function TransactionsPage() {
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "", page: 1 });
  const [search, setSearch] = useState("");
  const { data, error, isLoading, run, clearError } = useAsync<TransactionPage>();
  useEffect(() => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: "12" });
    Object.entries(filters).forEach(([key, value]) => { if (key !== "page" && value) query.set(key, String(value)); });
    void run(api.get<TransactionPage>(`/admin/transactions?${query}`)).catch(() => undefined);
  }, [filters, run]);
  const submit = (event: FormEvent) => { event.preventDefault(); setFilters((current) => ({ ...current, search, page: 1 })); };
  return <main className="admin-page">

    <PageHeader eyebrow="Payments" title="Transactions" description="Review payment outcomes and trace every purchase back to a customer and plan." />

    {error && <ErrorMessage message={error} onDismiss={clearError} />}

    <section className="panel data-panel transactions-list-panel">
      <div className="filters-row">
        <form className="search-box" onSubmit={submit}>
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user or email" />
          <button>Search</button>
        </form>
        <div className="filter-group">
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))}>
            <option value="">All statuses</option>{(["pending", "success", "declined"] as TransactionStatus[]).map((status) => <option key={status}>{status}</option>)}
          </select>
          <label className="date-filter">
            <CalendarDays size={16} />
            <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value, page: 1 }))} aria-label="From date" />
          </label>
          <label className="date-filter">
            <span>to</span>
            <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value, page: 1 }))} aria-label="To date" />
          </label>
        </div>
      </div>
      {isLoading && !data ? <TableSkeleton columns={6} /> : !data?.items.length ? <div className="empty-state">No transactions match these filters.</div> : <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Plan / product</th>
              <th>Provider</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date & time</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((transaction) =>
              <tr key={transaction.id}>
                <td>
                  <div className="user-cell">
                    <span className="avatar-fallback">{transaction.userId?.name?.slice(0, 1) ?? "?"}</span>
                    <div>
                      <strong>{transaction.userId?.name ?? "Deleted user"}</strong>
                      <small>{transaction.userId?.email ?? "—"}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <strong>{transaction.planId?.name ?? transaction.product?.name ?? "Custom purchase"}</strong>
                </td>
                <td>
                  <div className="transaction-provider-cell">
                    {transaction.provider === "manual" ? (
                      <span className="provider-brand transaction-provider-manual" aria-hidden="true"><HandCoins size={20} /></span>
                    ) : (
                      <span className={`provider-brand provider-brand-${transaction.provider}`} aria-hidden="true">
                        <PaymentProviderMark provider={transaction.provider} />
                      </span>
                    )}
                    
                  </div>
                </td>
                <td>
                  <strong>{money(transaction.amountMinor ?? Math.round(transaction.amount * 100))}</strong>
                  <small className="currency-code mx-1">{transaction.currency}</small></td><td>
                  <span className={`transaction-status ${transaction.status}`}>{transaction.status}</span></td><td>
                  <span className="date-cell">{new Date(transaction.createdAt).toLocaleDateString()}<small>{new Date(transaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span></td></tr>)}
          </tbody>
        </table>
      </div>}
      {data && <div className="pagination"><span>{data.total} transactions</span><div><button disabled={filters.page <= 1 || isLoading} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {data.page} of {data.pages}</span><button disabled={filters.page >= data.pages || isLoading} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div></div>}
    </section>
  </main>;
}
