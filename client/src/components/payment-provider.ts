import type { PaymentProvider } from "@shared/types";

interface PaymentProviderMeta {
  label: string;
  logoSrc: string;
  width: number;
  height: number;
}

export const paymentProviderMeta: Record<PaymentProvider, PaymentProviderMeta> = {
  stripe: {
    label: "Stripe",
    logoSrc: "/payments/stripe.png",
    width: 38,
    height: 38,
  },
  paypal: {
    label: "PayPal",
    logoSrc: "/payments/paypal.svg",
    width: 30,
    height: 30,
  },
  paymob: {
    label: "Paymob",
    logoSrc: "/payments/paymob.png",
    width: 36,
    height: 36
  },
};
