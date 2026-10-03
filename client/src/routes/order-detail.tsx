/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */

import Header from "../components/header";

import type { OrderType } from "../lib/types";
import { ArrowLeft, Download, ReceiptText } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorMessage } from "../components/ui/error-message";
import { ErrorState } from "./error/error";
import { Spinner } from "../components/ui/spinner";
import { useAsync } from "../hooks/use-async";
import { api, saveApiFile } from "../lib/api";
import { dateTime, money } from "../lib/format";

export default function OrderDetailPage() {
    const { id } = useParams();
    
    const request = useAsync<OrderType>();
    const invoice = useAsync<{ blob: Blob; filename: string }>();

    useEffect(() => {
        if (id) void request.run(api.get<OrderType>(`/orders/${id}`)).catch(() => undefined);
    }, [id, request.run]);

    if (request.error || (!request.isLoading && !request.data)) return <ErrorState
        title={request.error ? "We couldn’t load this order" : "Order not found"}
        message={request.error ?? "This order may no longer exist or you may not have access to it."}
        onRetry={id ? () => void request.run(api.get<OrderType>(`/orders/${id}`)).catch(() => undefined) : undefined}
        retryLabel="Reload order"
        backTo="/purchases"
        backLabel="Back to your library"
    />;

    return <div className="store-page">
        <Header />
        <main className="mx-auto max-w-[1180px] w-full mb-20">

            <Link className="back-link" to="/purchases">
                <ArrowLeft size={16} />Your library</Link>
            {request.isLoading && !request.data ?
                <div className="page-loader"><Spinner size="md" /></div>
                : request.data && <article className="receipt">
                        <header>
                            <div className="receipt-icon"><ReceiptText /></div>
                            <div>
                                <span className="eyebrow">Order receipt</span>
                                <h1>{request.data.orderNumber}</h1>
                                <p>{dateTime(request.data.createdAt)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className={`status-pill max-w-fit  ${request.data.status === "paid" ? "active" : "blocked"}`}>{request.data.status}</span>
                                {request.data.status === "paid" && <button className="secondary-button invoice-download" type="button" disabled={invoice.isLoading} onClick={() => void invoice.run(api.download(`/orders/${request.data!.id}/invoice`)).then(saveApiFile).catch(() => undefined)}>
                                    {invoice.isLoading ? <Spinner size="sm" /> : <Download size={16} />}Download invoice PDF</button>
                                }
                            </div>
                        </header>

                        {invoice.error && <ErrorMessage message={invoice.error} onDismiss={invoice.clearError} />}
                        <div className="receipt-items">
                            {request.data.items.map((item) => (
                                <div key={item.id ?? item.themeId}>
                                    <div>
                                        <strong>{item.name}</strong>
                                        <span>Version {item.version}</span>
                                    </div>
                                    <b className="text-zinc-500 text-sm">{money(item.totalMinor, request.data!.currency)}</b>
                                </div>))}
                        </div>
                        <dl>
                            <div>
                                <dt>Subtotal</dt>
                                <dd className="text-zinc-500 text-sm">{money(request.data.subtotalMinor, request.data.currency)}</dd>
                            </div>
                            {request.data.discountMinor > 0 && (
                                <div>
                                    <dt>Discount ({request.data.discountSnapshot?.code})</dt>
                                    <dd className="text-rose-500 text-sm">−{money(request.data.discountMinor, request.data.currency)}</dd>
                                </div>
                            )}
                            {request.data.taxMinor > 0 && (
                                <div>
                                    <dt>Tax</dt>
                                    <dd className="text-green-700 text-sm">+{money(request.data.taxMinor, request.data.currency)}</dd>
                                </div>
                            )}
                            <div className="summary-total">
                                <dt>Total Price</dt>
                                <dd>{money(request.data.totalMinor, request.data.currency)}</dd>
                            </div>
                            {request.data.paymentCurrency && request.data.paymentCurrency !== request.data.currency && request.data.paymentAmountMinor !== undefined && <div>
                                <dt>Charged by payment provider{request.data.paymentExchangeRate ? <small className="block">1 {request.data.currency} = {request.data.paymentExchangeRate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {request.data.paymentCurrency}</small> : null}</dt>
                                <dd>{money(request.data.paymentAmountMinor, request.data.paymentCurrency)}</dd>
                            </div>}
                        </dl>
                    </article>
            }
        </main>
    </div>;
}
