/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PurchaseOverviewType } from "../lib/types";
import { useCallback, useEffect } from "react";
import Header from "../components/header";
import { OrderList } from "../components/order-list";
import { Skeleton } from "../components/ui/skeleton";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { ErrorState } from "./error/error";

export default function OrdersPage() {
  const request = useAsync<PurchaseOverviewType>();
  const load = useCallback(() => request.run(api.get<PurchaseOverviewType>("/purchases")), [request.run]);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  if (request.error) return <ErrorState
    title="We couldn’t load your orders"
    message={request.error}
    onRetry={() => void load().catch(() => undefined)}
    retryLabel="Reload orders"
    backTo="/purchase"
    backLabel="Back to purchases"
  />;

  return <div className="store-page">
    <Header />
    <main className="library-page history-page">
      <div className="catalog-heading">
        <span className="eyebrow">Order history</span>
        <h1>Your completed orders</h1>
        <p>Review paid orders, receipts, totals, and purchase details.</p>
      </div>
      {request.isLoading && !request.data
        ? <div className="purchase-loading" aria-label="Loading orders">{[1, 2, 3].map((item) => <Skeleton className="purchase-card-skeleton" key={item} />)}</div>
        : <OrderList orders={request.data?.orders ?? []} />}
    </main>
  </div>;
}
