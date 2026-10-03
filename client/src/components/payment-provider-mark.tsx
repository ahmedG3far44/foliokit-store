import type { PaymentProvider } from "../lib/types";
import { paymentProviderMeta } from "./payment-provider";

interface PaymentProviderMarkProps {
  provider: PaymentProvider;
  alt?: string;
  className?: string;
}

export function PaymentProviderMark({ provider, alt = "", className }: PaymentProviderMarkProps) {
  const meta = paymentProviderMeta[provider];

  return (
    <img
      src={meta.logoSrc}
      alt={alt}
      width={meta.width}
      height={meta.height}
      className={`${className} mix-blend-multiply`}
    />
  );
}
