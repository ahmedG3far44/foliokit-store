/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { DiscountType, PaymentProvider, PaymentSettingsType } from "../../lib/types";
import { BadgePercent, CreditCard, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../../components/admin/page-header";
import { PaymentProviderMark } from "../../components/payment-provider-mark";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { useToast } from "../../context/toast-store";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { money } from "../../lib/format";

const emptyForm = {
  code: "",
  type: "percentage" as "percentage" | "fixed",
  value: "",
  currency: "USD",
  usageLimit: "100",
  expiresAt: "",
};

function discountStatus(discount: DiscountType) {
  if (!discount.active) return { label: "Paused", className: "blocked" };
  if (new Date(discount.expiresAt).getTime() <= Date.now()) return { label: "Expired", className: "blocked" };
  if (discount.timesUsed >= discount.usageLimit) return { label: "Limit reached", className: "pending" };
  return { label: "Active", className: "active" };
}

export default function AdminDiscountsPage() {
  
  const { notify } = useToast();

  const discounts = useAsync<DiscountType[]>();
  const settings = useAsync<PaymentSettingsType>();
  const createAction = useAsync<DiscountType>();
  const paymentAction = useAsync<PaymentSettingsType>();
  const discountAction = useAsync<DiscountType>();

  const [enabledProviders, setEnabledProviders] = useState<PaymentProvider[]>([]);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    await Promise.all([
      discounts.run(api.get<DiscountType[]>("/admin/discounts")),
      settings.run(api.get<PaymentSettingsType>("/admin/payment-settings")).then((data) => {
        setEnabledProviders(data.providers.filter((provider) => provider.selected).map((provider) => provider.id));
      }),
    ]);
  }, [discounts.run, settings.run]);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const toggleProvider = (provider: PaymentProvider) => {
    setEnabledProviders((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
  };

  const savePaymentMethods = async () => {
    if (!enabledProviders.length) return;
    try {
      const data = await paymentAction.run(api.put<PaymentSettingsType>("/admin/payment-settings", {
        enabledProviders,
      }));
      settings.setData(data);
      notify("Customer payment methods updated", "success");
    } catch { return; }
  };

  const createDiscount = async (event: FormEvent) => {
    event.preventDefault();
    const numericValue = Number(form.value);
    try {
      await createAction.run(api.post<DiscountType>("/admin/discounts", {
        code: form.code,
        type: form.type,
        ...(form.type === "percentage" ? { percentageBps: Math.round(numericValue * 100) } : { amountMinor: Math.round(numericValue * 100), currency: form.currency }),
        usageLimit: Number(form.usageLimit),
        expiresAt: new Date(form.expiresAt).toISOString(),
        active: true,
      }));
      setForm(emptyForm);
      notify("Discount code created", "success");
      await discounts.run(api.get<DiscountType[]>("/admin/discounts"));
    } catch { return; }
  };

  const toggleDiscount = async (discount: DiscountType) => {
    try {
      await discountAction.run(api.patch<DiscountType>(`/admin/discounts/${discount.id}`, { active: !discount.active }));
      notify(discount.active ? "Discount paused" : "Discount activated", "success");
      await discounts.run(api.get<DiscountType[]>("/admin/discounts"));
    } catch { return; }
  };

  const error = discounts.error || settings.error || createAction.error || paymentAction.error || discountAction.error;

  return <main className="admin-page">

    <PageHeader eyebrow="Checkout controls" title="Payments & discounts"
      description="Choose the payment methods customers can see, then create limited discount codes for checkout." />
    {error && <ErrorMessage message={error} onDismiss={() => {
      discounts.clearError();
      settings.clearError();
      createAction.clearError();
      paymentAction.clearError();
      discountAction.clearError();
    }} />}

    <div className="checkout-controls-grid">
      <section className="panel payment-settings-panel" aria-labelledby="payment-settings-title">
        <div className="panel-heading">
          <div>
            <h2 id="payment-settings-title">Customer payment methods</h2>
            <p>Only enabled and fully configured providers appear during checkout.</p>
          </div><CreditCard size={20} aria-hidden="true" />
        </div>
        {settings.isLoading && !settings.data ? <div className="control-loader"><Spinner size="md" /></div> : <div className="admin-payment-options">

          {settings.data?.providers.map((provider) => {
            const checked = enabledProviders.includes(provider.id);
            return <label className={`${checked ? "selected" : ""} ${provider.configured ? "" : "unavailable"}`} key={provider.id}>
              <input type="checkbox" checked={checked} disabled={!provider.configured || paymentAction.isLoading} onChange={() => toggleProvider(provider.id)} />
              <span className={`provider-brand provider-brand-${provider.id}`}>
                <PaymentProviderMark provider={provider.id} />
              </span>
              <span>
                <strong>{provider.label}</strong>
                <small>{provider.configured ? `${checked ? "Visible to customers" : "Hidden from customers"}` : "Add server credentials to enable"}
                </small>
              </span>
            </label>;
          })}

        </div>}
        <button className="primary-button payment-settings-save" type="button" disabled={!enabledProviders.length || settings.isLoading || paymentAction.isLoading} onClick={() => void savePaymentMethods()}>
          {paymentAction.isLoading ? <Spinner size="sm" /> : <Save size={16} />} Save payment methods
        </button>
      </section>

      <form className="panel discount-composer" onSubmit={createDiscount}>
        <div className="panel-heading"><div><h2>Create a discount code</h2><p>Set the value, checkout-use limit, and exact expiration.</p></div><BadgePercent size={20} aria-hidden="true" /></div>
        <div className="form-grid discount-form-grid">
          <label>Code<input required minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]+" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="LAUNCH15" /></label>
          <label>Discount type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as "percentage" | "fixed", value: "" }))}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
          <label>{form.type === "percentage" ? "Percentage off" : "Amount off"}<div className="discount-value-input">{form.type === "fixed" && <span>{form.currency}</span>}<input required type="number" min="0.01" max={form.type === "percentage" ? "99.99" : "1000000"} step="0.01" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} placeholder={form.type === "percentage" ? "15" : "10.00"} />{form.type === "percentage" && <span>%</span>}</div></label>
          {form.type === "fixed" && <label>Currency<select value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>}
          <label>Checkout-use limit<input required type="number" min="1" max="1000000" step="1" value={form.usageLimit} onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))} /></label>
          <label>Expiration date<input required type="datetime-local" min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
        </div>
        <div className="discount-submit"><small>Each checkout attempt that reserves this code consumes one use.</small><button className="primary-button" disabled={createAction.isLoading}>{createAction.isLoading ? <Spinner size="sm" /> : <Plus size={16} />}Create code</button></div>
      </form>
    </div>

    <section className="panel data-panel discount-list-panel">
      <div className="discount-list-heading"><div><h2>Discount codes</h2><p>Availability is rechecked on the server before a provider checkout is created.</p></div><span>{discounts.data?.length ?? 0} total</span></div>
      {discounts.isLoading && !discounts.data ? <div className="control-loader"><Spinner size="md" /></div> : !discounts.data?.length ? <div className="empty-state">No discount codes yet. Create the first code above.</div> : <div className="table-scroll"><table>
        <thead><tr><th>Code</th><th>Value</th><th>Uses</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{discounts.data.map((discount) => {
          const status = discountStatus(discount);
          return <tr key={discount.id}>
            <td><strong className="discount-code">{discount.code}</strong></td>
            <td>{discount.type === "percentage" ? `${((discount.percentageBps ?? 0) / 100).toLocaleString()}%` : money(discount.amountMinor ?? 0, discount.currency ?? "USD")}</td>
            <td><strong>{discount.timesUsed}</strong> / {discount.usageLimit}</td>
            <td>{new Date(discount.expiresAt).toLocaleString()}</td>
            <td><span className={`status-pill ${status.className}`}>{status.label}</span></td>
            <td><button className="secondary-button compact-button" type="button" disabled={discountAction.isLoading || new Date(discount.expiresAt).getTime() <= Date.now() || discount.timesUsed >= discount.usageLimit} onClick={() => void toggleDiscount(discount)}>{discount.active ? "Pause" : "Activate"}</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
  </main>;
}
