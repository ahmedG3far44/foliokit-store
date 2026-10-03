/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { IUser, OrderType } from "../../lib/types";
import { ArrowLeft, ExternalLink, Mail, ReceiptText, User } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { dateTime, money } from "../../lib/format";
import { ErrorState } from "../error/error";

interface AdminOrder extends OrderType { user: Pick<IUser, "name" | "email" | "provider"> }

const paymentProviderLabels = { stripe: "Stripe", paypal: "PayPal" } as const;

function discountDescription(order: OrderType): string {
  const discount = order.discountSnapshot;
  if (!discount) return "Discount";
  if (discount.type === "percentage" || discount.percentageBps !== undefined || discount.percentage !== undefined) {
    const percentage = discount.percentageBps !== undefined ? discount.percentageBps / 100 : discount.percentage;
    return `Discount (${discount.code} · ${percentage?.toLocaleString() ?? 0}% off)`;
  }
  if (discount.type === "fixed" && discount.amountMinor !== undefined) {
    return `Discount (${discount.code} · ${money(discount.amountMinor, discount.currency ?? order.currency)} off)`;
  }
  return `Discount (${discount.code})`;
}

export default function AdminOrderDetailPage() {
  const { id } = useParams();

  const request = useAsync<AdminOrder>();
  const invoice = useAsync<{ blob: Blob; filename: string }>();

  useEffect(() => {
    if (id) void request.run(api.get(`/admin/orders/${id}`)).catch(() => undefined);
  }, [id, request.run]);

  const order = request.data;

  if (request.isLoading && !order) return <main className="admin-page">
    <div className="page-loader"><Spinner size="md" /></div>
  </main>;

  if (request.error || !order) return <ErrorState
    title={request.error ? "We couldn’t load this order" : "Order not found"}
    message={request.error ?? "This marketplace order may no longer exist."}
    onRetry={id ? () => void request.run(api.get(`/admin/orders/${id}`)).catch(() => undefined) : undefined}
    retryLabel="Reload order"
    backTo="/dashboard/orders"
    backLabel="Back to marketplace orders"
  />;

  const previewInvoice = () => {
    const previewTab = window.open("", "_blank");
    if (!previewTab) {
      void invoice.run(Promise.reject(new Error("Your browser blocked the invoice preview. Allow pop-ups for this site and try again."))).catch(() => undefined);
      return;
    }
    previewTab.opener = null;
    previewTab.document.title = "Loading invoice preview…";
    previewTab.document.body.innerHTML = '<p style="font:14px Arial,sans-serif;padding:24px;color:#4f5a54">Loading invoice preview…</p>';
    void invoice.run(api.download(`/admin/orders/${order.id}/invoice`)).then((file) => {
      const url = URL.createObjectURL(file.blob);
      previewTab.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }).catch(() => previewTab.close());
  };

  return <main className="admin-page">
    <Link className="back-link" to="/dashboard/orders">
      <ArrowLeft size={16} />All marketplace orders</Link>
    <div className="order-admin-heading">
      <div><span className="eyebrow">Order details</span>
        <h1>{order.orderNumber}</h1>
        <p>Created {dateTime(order.createdAt)} {order.paidAt && `· Paid ${dateTime(order.paidAt)}`}</p>
      </div>
      <div className="order-heading-actions">
        {order.status === "paid" &&
          <button className="secondary-button" type="button" disabled={invoice.isLoading} onClick={previewInvoice}>
            {invoice.isLoading ? <Spinner size="sm" /> : <ExternalLink size={16} />}Preview invoice PDF</button>}
      </div>
    </div>

    {invoice.error && <ErrorMessage message={invoice.error} onDismiss={invoice.clearError} />}
    <div className="admin-order-grid">
      <article className="panel order-lines">
        <div className="panel-heading">
          <div><h2><ReceiptText size={18} />Purchased themes</h2>
            <p>The product and price snapshots captured at checkout.</p></div>
          <span className={`status-pill ${order.status === "paid" ? "active" : order.status === "pending" ? "pending" : "blocked"}`}>
            {order.status}
          </span>
        </div>
        {order.items.map((item) => <div className="order-line" key={item.id}><div>
          <strong>{item.name}</strong>
          <span>Version {item.version} · Theme ID {item.themeId}</span></div>
          <dl>
            <dt>Price</dt><dd className="text-zinc-500">{money(item.priceMinor, order.currency)}</dd>
          </dl>
        </div>)}
      </article>
      <aside>
        <article className="panel customer-panel">

          <h2 className="font-sem">Customer</h2>

          <p className="mt-2"><User size={16} />{order.user?.name ?? "Deleted user"}</p>
          <p><Mail size={16} />{order.user?.email ?? "Retained order record"}</p>
          <small className="flex items-center gap-2 my-2">

            <span className="capitalize my-2">
              <img className="w-4 h-4" src={`/providers/${order.user?.provider?.toLocaleLowerCase().trim()}.svg`} alt={order.user?.provider} />
            </span>

            <p>Account provider</p>
          </small>
        </article>
        <article className="bg-white p-4 rounded-2xl border border-zinc-200">
          <h2 className="font-semibold">Payment summary</h2>
          <dl className="flex flex-col gap-2 mt-4">
            <div className="flex justify-between text-xs">
              <dt>Subtotal</dt><dd className="text-zinc-500 font-normal">{money(order.subtotalMinor, order.currency)}</dd>
            </div>
            {order.discountMinor > 0 && <div className="flex justify-between gap-4 text-xs">
              <dt className="min-w-0 break-words">{discountDescription(order)}</dt><dd className="shrink-0 text-rose-600 font-normal">−{money(order.discountMinor, order.currency)}</dd>
            </div>}
            {order.taxMinor > 0 && <div className="flex justify-between text-xs">
              <dt>Tax</dt><dd className="text-green-800 font-normal ">+{money(order.taxMinor, order.currency)}</dd>
            </div>}
            {order.status === "paid" && <div className="flex justify-between gap-4 text-xs">
              <dt>Payment provider</dt><dd className="shrink-0 font-medium text-zinc-700">{paymentProviderLabels[order.paymentProvider]}</dd>
            </div>}
            {order.paymentCurrency && order.paymentCurrency !== order.currency && order.paymentAmountMinor !== undefined && <div className="flex justify-between gap-4 text-xs">
              <dt>Charged by provider</dt><dd className="shrink-0 font-medium text-zinc-700">{money(order.paymentAmountMinor, order.paymentCurrency)}</dd>
            </div>}
            {order.paymentExchangeRate && order.paymentCurrency && order.paymentCurrency !== order.currency && <div className="flex justify-between gap-4 text-xs">
              <dt>Exchange rate used</dt><dd className="shrink-0 font-medium text-zinc-700">1 {order.currency} = {order.paymentExchangeRate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {order.paymentCurrency}</dd>
            </div>}
            <div className="flex justify-between border-t border-zinc-200 mt-4 pt-4 font-semibold ">
              <dt>Total</dt>
              <dd >{money(order.totalMinor, order.currency)}
              </dd>
            </div>
          </dl>
        </article>
      </aside>
    </div>
  </main>
}
