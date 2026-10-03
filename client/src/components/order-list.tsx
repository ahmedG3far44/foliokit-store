import type { PurchaseOverviewType } from "../lib/types";
import { ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { dateTime, money } from "../lib/format";

export type PurchaseOrder = PurchaseOverviewType["orders"][number];

export function OrderRows({ orders, emptyMessage }: { orders: PurchaseOrder[]; emptyMessage: string }) {
  if (!orders.length) return <div className="history-empty"><ReceiptText size={22} /><p>{emptyMessage}</p></div>;

  return <div className="customer-orders">{orders.map((order) => <Link className="customer-order-row" to={`/orders/${order.id}`} key={order.id}>
    <span className="purchase-icon"><ReceiptText size={19} /></span>
    <span className="order-row-details"><strong>{order.orderNumber}</strong><small>{order.items.map((item) => item.name).join(", ")}</small></span>
    <span className="order-row-amount"><strong>{money(order.totalMinor, order.currency)}</strong><small>{dateTime(order.createdAt)}</small></span>
    <span className={`status-pill ${order.status === "paid" ? "active" : order.status === "pending" ? "pending" : "blocked"}`}>{order.status}</span>
  </Link>)}</div>;
}

export function OrderList({ orders }: { orders: PurchaseOrder[] }) {
  const completedOrders = orders.filter((order) => order.status === "paid");

  return <article className="order-history-panel completed-panel">
    <header>
      <div><span className="eyebrow">Payment confirmed</span><h2>Completed orders</h2><p>Paid orders with available purchase details.</p></div>
      <span className="history-count">{completedOrders.length}</span>
    </header>
    <OrderRows orders={completedOrders} emptyMessage="No completed orders yet." />
  </article>;
}
