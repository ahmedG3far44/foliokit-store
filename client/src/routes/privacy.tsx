import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { SiteContentType } from "@shared/types";
import Header from "../components/header";
import { Instructions } from "../components/instructions";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

const fallbackPrivacy = `<p>Portfolio Market (“we”, “us”) respects your privacy. This policy explains what we collect, how we use it, and your rights.</p>
<h2>1. Information we collect</h2>
<ul>
<li><strong>Account:</strong> the name and email you provide, a securely hashed password when you register by email, and an avatar when supplied by Google.</li>
<li><strong>Transactions:</strong> cart, orders, and payment confirmations. We do not store full card numbers; Stripe or PayPal processes payments.</li>
<li><strong>Usage:</strong> anonymized analytics, logs and preferences.</li>
</ul>
<h2>2. How we use it</h2>
<ul>
<li>To create your account, deliver purchased themes and manage downloads (5-download limit).</li>
<li>To process secure payments, prevent fraud and support customers.</li>
<li>To improve the product and communicate important updates.</li>
</ul>
<h2>3. Sharing</h2>
<p>We share data only with service providers needed to run the marketplace: Google when you choose Google sign-in, Stripe and PayPal for payments, hosting, and email. We never sell your data.</p>
<h2>4. Cookies</h2>
<p>Essential cookies keep you signed in and your cart persisted. Analytics cookies are used only with your consent where required by law.</p>
<h2>5. Your rights</h2>
<p>You can request access, correction or deletion of your personal data by contacting us. We will respond within 30 days.</p>
<h2>6. Contact</h2>
<p>Questions? Reach the developer at <a href="https://linkedin.com/in/ahmedg3far44" target="_blank" rel="noreferrer">linkedin.com/in/ahmedg3far44</a>.</p>`;

export default function PrivacyPage() {
  const content = useAsync<SiteContentType>();
  useEffect(() => { void content.run(api.get<SiteContentType>("/content")).catch(() => undefined); }, [content.run]);
  const html = content.data?.privacyHtml?.trim() ? content.data.privacyHtml : fallbackPrivacy;
  const isLoading = content.isLoading && !content.data;

  return (
    <div className="legal-page">
      <Header />
      <main className="legal-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <span className="eyebrow">Legal</span>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: {content.data?.updatedAt ? new Date(content.data.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="legal-content">
          {isLoading ? <div className="skeleton" style={{ height: 220 }} aria-hidden="true" /> : <Instructions value={html} format="html" />}
        </div>
      </main>
    </div>
  );
}
