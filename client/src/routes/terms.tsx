import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { SiteContentType } from "../lib/types";
import Header from "../components/header";
import { Instructions } from "../components/instructions";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";

const fallbackTerms = `<p>By accessing Portfolio Market you agree to these Terms. If you do not agree, do not use the service.</p>
<h2>1. Licenses</h2>
<p>Each theme includes a single-portfolio license for the version you purchased. You may customize it for one live portfolio/domain. Redistribution, resale or sharing source files is prohibited.</p>
<h2>2. Purchases &amp; delivery</h2>
<p>Prices are shown at checkout. After successful payment via Stripe or PayPal, downloads are unlocked instantly and remain available for 5 downloads. You are responsible for backing up files.</p>
<h2>3. User responsibilities</h2>
<ul>
<li>Provide accurate account information.</li>
<li>Do not attempt to bypass download limits or payment flows.</li>
<li>Do not upload malicious code or abuse the platform.</li>
</ul>
<h2>4. Intellectual property</h2>
<p>All themes, content and branding are protected. You retain rights to your own portfolio content built with the themes.</p>
<h2>5. Disclaimer</h2>
<p>Themes are provided “as is”. We do not guarantee compatibility with every hosting environment, though setup and deployment guides are provided.</p>
<h2>6. Changes</h2>
<p>We may update these Terms. Continued use after changes means acceptance. For questions contact <a href="https://linkedin.com/in/ahmedg3far44" target="_blank" rel="noreferrer">@ahmedG3far44</a>.</p>`;

export default function TermsPage() {
  const content = useAsync<SiteContentType>();
  useEffect(() => { void content.run(api.get<SiteContentType>("/content")).catch(() => undefined); }, [content.run]);
  const html = content.data?.termsHtml?.trim() ? content.data.termsHtml : fallbackTerms;
  const isLoading = content.isLoading && !content.data;

  return (
    <div className="legal-page">
      <Header />
      <main className="legal-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <span className="eyebrow">Legal</span>
        <h1>Terms &amp; Conditions</h1>
        <p className="legal-updated">Last updated: {content.data?.updatedAt ? new Date(content.data.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="legal-content">
          {isLoading ? <div className="skeleton" style={{ height: 220 }} aria-hidden="true" /> : <Instructions value={html} format="html" />}
        </div>
      </main>
    </div>
  );
}
