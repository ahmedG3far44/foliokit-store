/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PurchaseOverviewType } from "../lib/types";
import { CheckCircle2, Clock3, PackageOpen, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorMessage } from "../components/ui/error-message";
import { ErrorState } from "./error/error";
import { Skeleton } from "../components/ui/skeleton";
import { Spinner } from "../components/ui/spinner";
import { useToast } from "../context/toast-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

import Header from "../components/header";
import { OwnedThemeCard } from "../components/owned-theme-card";

export default function PurchasesPage() {
  const request = useAsync<PurchaseOverviewType>();
  const download = useAsync<{ url: string; expiresInSeconds: number }>();
  const { notify } = useToast();
  const cart = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnedOrderId = params.get("order_id") ?? sessionStorage.getItem("pendingOrderId");
  const paymentReturn = params.get("payment");
  const paypalToken = params.get("token");
  const returningFromPayment = paymentReturn === "processing" || paymentReturn === "paypal";
  const paypalCaptureStarted = useRef(false);
  const [confirmation, setConfirmation] = useState<"idle" | "processing" | "paid" | "failed" | "delayed">(returningFromPayment ? "processing" : "idle");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const load = useCallback(() => request.run(api.get<PurchaseOverviewType>("/purchases")), [request.run]);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  useEffect(() => {
    if (!returningFromPayment || !returnedOrderId) return;
    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const overview = await load();
        if (!active) return;
        const order = overview.orders.find((item) => item.id === returnedOrderId);
        if (order?.status === "paid") {
          setConfirmation("paid");
          sessionStorage.removeItem("pendingOrderId");
          await cart.refresh().catch(() => undefined);
          if (!active) return;
          notify("Payment confirmed. Your theme is ready to download");
          timer = window.setTimeout(() => navigate("/purchase", { replace: true }), 1200);
          return;
        }
        if (order?.status === "failed" || order?.status === "refunded") {
          setConfirmation("failed");
          sessionStorage.removeItem("pendingOrderId");
          return;
        }
      } catch {
        if (!active) return;
      }
      attempts += 1;
      if (attempts < 30) timer = window.setTimeout(() => void poll(), 2000);
      else setConfirmation("delayed");
    };
    const confirmAndPoll = async () => {
      if (paymentReturn === "paypal") {
        if (!paypalToken) {
          if (active) setConfirmation("failed");
          return;
        }
        if (!paypalCaptureStarted.current) {
          paypalCaptureStarted.current = true;
          try {
            await api.post("/checkout/paypal/capture", { token: paypalToken });
          } catch {
            if (active) setConfirmation("failed");
            return;
          }
        }
      }
      await poll();
    };
    void confirmAndPoll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [cart.refresh, load, navigate, notify, paypalToken, paymentReturn, returnedOrderId, returningFromPayment]);

  const getFile = async (id: string) => {
    setDownloadingId(id);
    try {
      const result = await download.run(api.post(`/entitlements/${id}/download`));
      window.location.assign(result.url);
      notify("Your secure download is ready");
      await load();
    } catch { return; }
    finally { setDownloadingId(null); }
  };

  const entitlements = request.data?.entitlements ?? [];

  if (request.error) return <ErrorState
    title="We couldn’t load your library"
    message={request.error}
    onRetry={() => void load().catch(() => undefined)}
    retryLabel="Reload purchases"
    backTo="/themes"
    backLabel="Browse themes"
  />;


  return <div className="store-page">
    <Header />
    <main className="library-page">
      <div className="catalog-heading">
        <span className="eyebrow">Your library</span><h1>Your purchased themes</h1>
        <p>Download the themes you own and open their details or live previews.</p>
      </div>

      {confirmation !== "idle" && <div className={`payment-confirmation ${confirmation}`} role="status" aria-live="polite">

        {confirmation === "processing" ? <Spinner size="sm" /> : confirmation === "paid" ? <CheckCircle2 /> : confirmation === "failed" ? <XCircle /> : <Clock3 />}

        <div>
          <strong>{confirmation === "paid" ? "Payment confirmed" : confirmation === "failed" ? "Payment was not completed" : confirmation === "delayed" ? "Confirmation is taking longer than expected" : "Confirming your payment"}</strong>
          <span>
            {confirmation === "paid" ? "Your cart is empty and your download is now available." : confirmation === "failed" ? "Your order was not charged successfully." : "This page will update when the payment provider confirms the transaction."}
          </span>
        </div>

      </div>}

      {download.error && <ErrorMessage message={download.error} onDismiss={download.clearError} />}

      {request.isLoading && !request.data ? <div className="purchase-loading" aria-label="Loading purchases">

        {[1, 2, 3].map((item) => <Skeleton className="purchase-card-skeleton" key={item} />)}

      </div> : <>

        <section className="library-section" aria-labelledby="downloads-heading">

          <div className="library-section-heading">
            <div>
              <span className="eyebrow">Available now</span>
              <h2 id="downloads-heading">Theme downloads</h2>
            </div>
            <span>
              {entitlements.length} {entitlements.length === 1 ? "theme" : "themes"}
            </span>
          </div>

          {entitlements.length ? (
            <div className="purchase-grid">
              {entitlements.map((item) => (
                <OwnedThemeCard key={item.id} entitlement={item} downloading={downloadingId === item.id} onDownload={(id) => void getFile(id)} />
              ))}
            </div>
          ) : (
            <div className="library-empty">
              <PackageOpen size={25} />
              <p>Paid theme downloads will appear here after the payment webhook is confirmed.</p>
            </div>
          )}

        </section>

      </>}
    </main>
  </div>;
}
