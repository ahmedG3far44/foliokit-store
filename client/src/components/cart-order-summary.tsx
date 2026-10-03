import type { CartType, DiscountQuote, PaymentProvider } from "../lib/types";
import { Check, LockKeyhole, ShieldCheck, Tag, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { PaymentProviderMark } from "./payment-provider-mark";
import { Spinner } from "./ui/spinner";

interface CartOrderSummaryProps {
  cart: CartType;
  checkoutBusy: boolean;
  paymentProvider?: PaymentProvider;
  availablePaymentProviders: PaymentProvider[];
  paymentOptionsLoading: boolean;
  discount: DiscountQuote | null;
  onDiscountChange: (discount: DiscountQuote | null) => void;
  onPaymentProviderChange: (provider: PaymentProvider) => void;
  onCheckout: () => void;
}

const paymentProviderLabels: Record<PaymentProvider, string> = { stripe: "Stripe", paypal: "PayPal" };

export function CartOrderSummary({ cart, checkoutBusy, paymentProvider, availablePaymentProviders, paymentOptionsLoading, discount, onDiscountChange, onPaymentProviderChange, onCheckout }: CartOrderSummaryProps) {
  const cartState = useCart();
  const discountAction = useAsync<DiscountQuote>();
  const [discountCode, setDiscountCode] = useState("");

  const taxStatus = discount?.taxStatus ?? cart.taxStatus;
  const taxPercentage = discount?.taxPercentage ?? cart.taxPercentage;
  const taxMinor = discount?.taxMinor ?? cart.taxMinor;
  const totalMinor = discount?.totalMinor ?? cart.totalMinor;
  const taxCalculated = taxStatus === "estimated";
  const taxLabel = taxCalculated && taxPercentage !== undefined
    ? `Estimated tax (${taxPercentage.toLocaleString(undefined, { maximumFractionDigits: 2 })}%)`
    : "Tax";

  const applyDiscount = async (event: FormEvent) => {
    event.preventDefault();
    if (!discountCode.trim()) return;
    try {
      const quote = await discountAction.run(api.post<DiscountQuote>("/cart/discounts/validate", { code: discountCode.trim() }));
      setDiscountCode(quote.code);
      onDiscountChange(quote);
    } catch { return; }
  };

  const clearDiscount = () => {
    setDiscountCode("");
    onDiscountChange(null);
    discountAction.clearError();
  };

  return <aside className="order-summary" aria-labelledby="order-summary-title">
    <div className="order-summary-heading">
      <div><span className="eyebrow">Checkout</span><h2 id="order-summary-title">Order summary</h2></div>
    </div>

    <dl className="summary-totals text-xs">
      <div>
        <dt>Subtotal</dt>
        <dd>{money(cart.subtotalMinor, cart.currency)}</dd>
      </div>

      {discount && <div className="summary-discount text-xs">

        <dt>
          Discount <small>{discount.code}</small>
        </dt>
        <dd>
          −{money(discount.discountMinor, cart.currency)}
        </dd>

      </div>}

      <div className="tax-row">
        <dt>{taxLabel}
          <small>Finalized from your billing address</small>
        </dt>
        <dd>
          {taxCalculated ? money(taxMinor, cart.currency) : "At checkout"}
        </dd>
      </div>

      <div className="summary-total">
        <dt>{taxCalculated ? "Estimated total" : "Subtotal before tax"}</dt>
        <dd>{money(totalMinor, cart.currency)}</dd>
      </div>

    </dl>

    <form className={`discount-entry ${discount ? "applied" : ""}`} onSubmit={applyDiscount}>
      <label htmlFor="discount-code"><Tag size={15} aria-hidden="true" />Discount code</label>
      <div className="discount-entry-control">
        <input id="discount-code" value={discountCode} maxLength={32} pattern="[A-Za-z0-9_-]+" onChange={(event) => { setDiscountCode(event.target.value.toUpperCase()); if (discount) onDiscountChange(null); discountAction.clearError(); }} placeholder="Enter code" disabled={checkoutBusy || discountAction.isLoading} />
        {discount ? <button type="button" className="discount-remove" onClick={clearDiscount} aria-label="Remove discount"><X size={16} /></button> : <button type="submit" disabled={!discountCode.trim() || checkoutBusy || discountAction.isLoading}>{discountAction.isLoading ? <Spinner size="sm" /> : "Apply"}</button>}
      </div>
      {discountAction.error && <small className="discount-feedback error" role="alert">{discountAction.error}</small>}
      {discount && <small className="discount-feedback success" role="status"><Check size={13} />{discount.type === "percentage" ? `${((discount.percentageBps ?? 0) / 100).toLocaleString()}% off` : `${money(discount.amountMinor ?? 0, discount.currency ?? cart.currency)} off`} applied</small>}
    </form>

    <fieldset className="payment-providers" disabled={checkoutBusy || cartState.isLoading}>

      <legend>Payment method</legend>

      <div className="payment-providers-heading">
        <p className="payment-providers-intro">Choose where you want to complete this payment.</p>
        <span className="payment-security-note"><ShieldCheck size={14} aria-hidden="true" />Secure checkout</span>
      </div>

      {paymentOptionsLoading ? (
        <div className="payment-loading">
          <Spinner size="sm" /> Loading payment methods…
        </div>
      ) : !availablePaymentProviders.length ? (
        <div className="payment-unavailable">
          No payment methods are available right now. Please try again later.
        </div>
      ) : (
        <div className="payment-provider-options">

          {availablePaymentProviders.includes("paypal") && <label className={paymentProvider === "paypal" ? "selected" : ""}>
            <input type="radio" name="payment-provider" value="paypal" checked={paymentProvider === "paypal"} onChange={() => onPaymentProviderChange("paypal")} />
            <span className=""><PaymentProviderMark provider="paypal" /></span>
            <span className="payment-provider-copy">
              <span className="payment-provider-title"><strong>PayPal</strong></span>
              <small>Use your PayPal balance or a saved payment method</small>
            </span>
            <span className="payment-provider-radio" aria-hidden="true" />
          </label>}

          {availablePaymentProviders.includes("stripe") && <label className={paymentProvider === "stripe" ? "selected" : ""}>
            <input type="radio" name="payment-provider" value="stripe" checked={paymentProvider === "stripe"} onChange={() => onPaymentProviderChange("stripe")} />
            <span className=""><PaymentProviderMark provider="stripe" /></span>
            <span className="payment-provider-copy">
              <span className="payment-provider-title"><strong>Card or digital wallet</strong></span>
              <small>Visa, Mastercard and wallet options </small>
            </span>
            <span className="payment-provider-radio" aria-hidden="true" />
          </label>
          }

        </div>
      )}
    </fieldset>

    <button type="button" className="primary-button checkout-button mb-2 " onClick={onCheckout} disabled={checkoutBusy || cartState.isLoading || paymentOptionsLoading || !paymentProvider}>
      {checkoutBusy ? <Spinner size="sm" /> : <LockKeyhole size={17} />}
      {checkoutBusy ? "Checkout Processing…" : paymentProvider ? `Continue with ${paymentProviderLabels[paymentProvider]}` : "Payment unavailable"}
    </button>

    <p className="checkout-note">{paymentProvider === "stripe" ? "Stripe calculates final tax from your billing address. The checkout total may differ from this estimate." : paymentProvider === "paypal" ? "You’ll review and approve the final amount securely on PayPal." : "An administrator must enable a configured payment provider before checkout."}</p>
  </aside>;
}
