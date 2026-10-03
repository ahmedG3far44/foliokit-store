import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { SiteContentType } from "../lib/types";
import Header from "../components/header";
import { Instructions } from "../components/instructions";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

const fallbackRefund = `<p>We sell instant digital goods. Because delivery is immediate, refunds are limited but we aim to be fair.</p>
<h2>1. Eligibility</h2>
<ul>
<li>Duplicate purchase of the same theme in error — eligible if no download has been consumed.</li>
<li>Defective file that cannot be extracted after support attempts — eligible within 7 days.</li>
<li>Charge not authorized — contact us immediately; we will investigate with Stripe.</li>
</ul>
<h2>2. Non-eligible</h2>
<p>“Changed my mind”, compatibility issues due to custom modifications, or after any successful download has been used are not eligible. Pre-purchase previews and documentation should be reviewed first.</p>
<h2>3. How to request</h2>
<p>Message us with order ID, email and reason within 7 days of purchase. We reply within 2 business days. Contact via <a href="https://linkedin.com/in/ahmedg3far44" target="_blank" rel="noreferrer">linkedin.com/in/ahmedg3far44</a> or support email.</p>
<h2>4. Payment reversals</h2>
<p>Approved refunds are issued to the original payment method. Stripe and PayPal processing times vary by funding source. Currency conversion fees, if any, are not refundable.</p>
<h2>5. Download abuse</h2>
<p>Each order includes 5 secure downloads. Exceeding or sharing download links may void refund eligibility.</p>`;

export default function RefundPage() {
  const content = useAsync<SiteContentType>();
  useEffect(() => { void content.run(api.get<SiteContentType>("/content")).catch(() => undefined); }, [content.run]);
  const html = content.data?.refundHtml?.trim() ? content.data.refundHtml : fallbackRefund;
  const isLoading = content.isLoading && !content.data;

  return (
    <div className="legal-page">
      <Header />
      <main className="legal-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <span className="eyebrow">Legal</span>
        <h1>Refund Policy</h1>
        <p className="legal-updated">Last updated: {content.data?.updatedAt ? new Date(content.data.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="legal-content">
          {isLoading ? <div className="skeleton" style={{ height: 220 }} aria-hidden="true" /> : <Instructions value={html} format="html" />}
        </div>
      </main>
    </div>
  );
}
