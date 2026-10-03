/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PurchaseOverviewType } from "../lib/types";
import { useCallback, useEffect } from "react";
import Header from "../components/header";
import { TransactionList } from "../components/transaction-list";
import { Skeleton } from "../components/ui/skeleton";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { ErrorState } from "./error/error";

export default function TransactionsPage() {
  const request = useAsync<PurchaseOverviewType>();
  const load = useCallback(() => request.run(api.get<PurchaseOverviewType>("/purchases")), [request.run]);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  if (request.error) return <ErrorState
    title="We couldn’t load your transactions"
    message={request.error}
    onRetry={() => void load().catch(() => undefined)}
    retryLabel="Reload transactions"
    backTo="/purchase"
    backLabel="Back to purchases"
  />;

  return <div className="store-page">
    <Header />
    <main className="library-page history-page">
      <div className="catalog-heading">
        <span className="eyebrow">Payment activity</span>
        <h1>Your transactions</h1>
        <p>Track checkout attempts that are pending or need your attention.</p>
      </div>
      {request.isLoading && !request.data
        ? <div className="purchase-loading" aria-label="Loading transactions">{[1, 2, 3].map((item) => <Skeleton className="purchase-card-skeleton" key={item} />)}</div>
        : <TransactionList orders={request.data?.orders ?? []} />}
    </main>
  </div>;
}
