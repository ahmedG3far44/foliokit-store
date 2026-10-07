
/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import Header from "../components/header";

import { api } from "../lib/api";
import { useEffect } from "react";
import { money } from "../lib/format";
import { ErrorState } from "./error/error";
import { useAsync } from "../hooks/use-async";
import { useCart } from "../context/cart-store";
import { themePreview } from "../lib/theme-media";
import { Link, useParams } from "react-router-dom";
import { useAppAuth } from "../context/auth-store";
import { Skeleton } from "../components/ui/skeleton";
import { ThemeMedia } from "../components/theme-media";
import { Instructions } from "../components/instructions";
import { ThemeGallery } from "../components/theme-gallery";
import { ArrowLeft, ArrowUpRight, Check, Download, Eye, ShoppingBag } from "lucide-react";

import type { ThemeType } from "../lib/types";
import { Seo } from "../components/seo";

export default function ThemeDetailPage() {
  const cart = useCart();
  const request = useAsync<ThemeType>();

  const { slug } = useParams();
  const { user } = useAppAuth();

  useEffect(() => { if (slug) void request.run(api.get<ThemeType>(`/themes/${slug}`)).catch(() => undefined); }, [slug, request.run]);
  if (request.isLoading && !request.data) return <><Header /><main className="detail-page"><Skeleton className="detail-skeleton" /></main></>;
  if (request.error || !request.data) return <ErrorState
    title={request.error ? "We couldn’t load this theme" : "Theme not found"}
    message={request.error ?? "This theme may have been removed or is no longer published."}
    backTo="/themes"
    backLabel="Back to themes"
    onRetry={slug ? () => void request.run(api.get<ThemeType>(`/themes/${slug}`)).catch(() => undefined) : undefined}
    retryLabel="Reload theme"
  />
  const theme = request.data;

  return <div className="store-page"><Seo title={`${theme.name} | Portfolio Template | Folio Kit`} description={theme.description} /><Header /><main className="detail-page">

    <Link className="back-link" to="/themes"><ArrowLeft size={16} />All themes</Link>

    <section className="detail-hero">

      <div className="detail-copy w-full">

        <div className="theme-card-meta"><div>{theme.stack.map((item) => <span key={item}>{item}</span>)}</div></div>
        <div>
          <h1>{theme.name}</h1>


          <div className="detail-actions">
            <span className="detail-price" aria-label={`Price ${money(theme.priceMinor, theme.currency)}`}>{money(theme.priceMinor, theme.currency)}</span>

            <div className="detail-cta-group">
              {theme.purchased ? <Link className="primary-button detail-primary-cta" to="/purchases">Open library <Download size={15} /></Link>
                : user?.role === "admin" ? null
                  : theme.canPurchase === false ? <button className="primary-button detail-primary-cta" disabled title="The download package has not been uploaded yet"><ShoppingBag size={15} />Coming soon</button>
                    : user ? <button className="primary-button detail-primary-cta" disabled={cart.isLoading} onClick={() => void cart.add(theme.id).catch(() => undefined)}><ShoppingBag size={15} />Add to cart</button>
                      : <Link className="primary-button detail-primary-cta" to="/sign-in">Sign in to purchase</Link>}

              {(theme.purchased || user?.role !== "admin") ? <span className="detail-cta-divider" aria-hidden="true" /> : null}

              <div className="detail-preview-group">
                <Link className="secondary-button detail-preview-button" to={`/themes/${theme.slug}/preview`}><Eye size={15} />Live preview <ArrowUpRight size={14} /></Link>
              </div>
            </div>
          </div>

        </div>

        <p>{theme.description}</p>
      </div>

      <div className="detail-preview"><ThemeMedia  asset={themePreview(theme)} alt={`Preview of ${theme.name}`} preview /></div>

      {theme.images.length > 0 && <section className="detail-section" id="gallery" aria-labelledby="gallery-title">
        <span className="eyebrow">A closer look</span><h2 id="gallery-title">Theme gallery</h2><p>Explore every screen. Select an image to view it full size.</p>
        <ThemeGallery key={theme.id} images={theme.images} name={theme.name} />
      </section>}

    </section>


    <nav className="detail-section-nav" aria-label="Theme details">
      <a href="#features">Features</a>
      {theme.images.length > 0 && <a href="#gallery">Gallery ({theme.images.length})</a>}
      {theme.videos.length > 0 && <a href="#tutorials">Tutorials ({theme.videos.length})</a>}
      {theme.setupInstructions && <a href="#setup">Setup</a>}
      {theme.deployInstructions && <a href="#deployment">Deployment</a>}
      {theme.changelog && <a href="#changelog">Changelog</a>}
    </nav>

    <section className="detail-info" id="features">
      <article><span className="eyebrow">What’s included</span><h2>Everything you need to launch.</h2><ul>{theme.features.map((feature) => <li key={feature}><Check size={16} />{feature}</li>)}</ul></article>
      <aside><dl>
        <div><dt>Version</dt><dd>{theme.version}</dd></div><div><dt>License</dt><dd>Single portfolio</dd></div>
        <div><dt>Downloads</dt><dd>{theme.canPurchase === false ? "Not available yet" : "5 secure downloads"}</dd></div>
        <div><dt>Delivery</dt><dd>{theme.canPurchase === false ? "Package coming soon" : "Immediate after payment"}</dd></div>
      </dl></aside>
    </section>


    {theme.videos.length > 0 && <section className="detail-section" id="tutorials" aria-labelledby="tutorials-title">
      <span className="eyebrow">Video walkthroughs</span><h2 id="tutorials-title">Setup, deploy, and make it yours</h2>
      <div className="theme-tutorials">{theme.videos.map((asset, index) => <figure key={asset.id}>
        <ThemeMedia asset={asset} alt={`${theme.name} tutorial ${index + 1}: ${asset.originalName}`} />
        <figcaption><strong>Tutorial {index + 1}</strong><span>{asset.originalName}</span></figcaption>
      </figure>)}</div>
    </section>}

    {theme.setupInstructions && <section className="detail-section detail-documentation" id="setup" aria-labelledby="setup-title"><span className="eyebrow">Getting started</span><h2 id="setup-title">Setup instructions</h2><Instructions value={theme.setupInstructions} format={theme.instructionsFormat} /></section>}
    {theme.deployInstructions && <section className="detail-section detail-documentation" id="deployment" aria-labelledby="deployment-title"><span className="eyebrow">Go live</span><h2 id="deployment-title">Deployment instructions</h2><Instructions value={theme.deployInstructions} format={theme.instructionsFormat} /></section>}
    {theme.changelog && <section className="detail-section" id="changelog"><h2>Changelog</h2><div className="changelog-content">{theme.changelog}</div></section>}
  </main></div>;
}
