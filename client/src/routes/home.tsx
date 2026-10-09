import { CategoryCards } from "../components/category-cards";
import type { CatalogResponse } from "../lib/types";
import { ArrowRight, CheckCircle2, Code2, Rocket } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ThemeCard } from "../components/theme-card";
import { ErrorMessage } from "../components/ui/error-message";
import { Skeleton } from "../components/ui/skeleton";
import { useAppAuth } from "../context/auth-store";
import { useCart } from "../context/cart-store";
import { useAsync } from "../hooks/use-async";
import { api } from "../lib/api";
import { preloadThemePreviews } from "../lib/preload-theme-previews";
import HeroSection from "../components/hero";
import LogoMarquee from "@/components/logos-loop";

export default function Home() {
  const pageRef = useRef<HTMLDivElement>(null);
  const { user } = useAppAuth();
  const cart = useCart();
  const { data, error, isLoading, run, clearError } = useAsync<CatalogResponse>();

  useEffect(() => {
    void run(api.get<CatalogResponse>("/themes?featured=true&limit=6&sort=popular").then(preloadThemePreviews)).catch(() => undefined);
  }, [run]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const sections = Array.from(page.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
      return;
    }

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.94 && rect.bottom > 0) section.classList.add("is-visible");
    });
    page.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
      }),
      { rootMargin: "8% 0px 8%", threshold: 0.12 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return <div ref={pageRef} className="marketing-page">
    <HeroSection />
    <LogoMarquee />
    <main>
      <CategoryCards />
      {/* <section className="buyer-assurance landing-reveal" data-reveal aria-label="Why choose Folio Kit">
        <p>Made for creative people who want to launch—not wrestle with a blank canvas.</p>
        <div>
          <span><strong>One-time ownership</strong><small>Buy once. No subscription.</small></span>
          <span><strong>Ready to shape</strong><small>Clean source and clear guides.</small></span>
          <span><strong>Secure delivery</strong><small>Stripe checkout and protected files.</small></span>
        </div>
      </section> */}
      <section className="featured-themes landing-reveal" data-reveal id="featured-themes">
        <div className="section-heading"><div><span className="eyebrow">Editor’s selection</span><h2>Start with a direction worth remembering.</h2><p>Distinct visual systems for different kinds of creative work—curated so you can choose with confidence.</p></div><Link to="/themes">Browse all themes <ArrowRight size={17} /></Link></div>
        {error && <ErrorMessage message={error} onDismiss={clearError} />}
        {isLoading && !data ? (
          <div className="theme-grid">{[1, 2, 3].map((number) => <Skeleton className="theme-card-skeleton" key={number} />)}</div>
        ) : data?.items.length ? (
          <div className="theme-grid">{data.items.map((theme) => <ThemeCard
            key={theme.id}
            theme={theme}
            inCart={cart.cart?.items.some((item) => item.themeId === theme.id)}
            isAdmin={user?.role === "admin"}
            onAdd={user && user.role !== "admin" ? (id) => void cart.add(id).catch(() => undefined) : undefined}
            adding={cart.isLoading}
          />)}</div>
        ) : <div className="catalog-empty"><Link to="/themes">Explore our portfolio template collection</Link></div>}
      </section>

      <section className="launch-process landing-reveal" data-reveal aria-labelledby="launch-process-title">
        <div className="launch-process-heading">
          <span className="eyebrow">A faster path to launch</span>
          <h2 id="launch-process-title">Skip the blank page.<br />Keep the creative control.</h2>
          <p>Folio Kit gives you the hard parts already resolved, while leaving the work unmistakably yours.</p>
        </div>
        <div className="launch-process-grid">
          <article>
            <span className="process-icon"><CheckCircle2 size={22} aria-hidden="true" /></span>
            <small>01 / Choose</small>
            <h3>Find your visual direction</h3>
            <p>Compare focused themes built around real creative disciplines, not generic landing-page blocks.</p>
          </article>
          <article>
            <span className="process-icon"><Code2 size={22} aria-hidden="true" /></span>
            <small>02 / Customize</small>
            <h3>Make the system yours</h3>
            <p>Work from organized source code and practical documentation instead of starting from zero.</p>
          </article>
          <article>
            <span className="process-icon"><Rocket size={22} aria-hidden="true" /></span>
            <small>03 / Publish</small>
            <h3>Launch while momentum is high</h3>
            <p>Ship a polished portfolio sooner and get back to the work you actually want people to see.</p>
          </article>
        </div>
      </section>

      <section className="market-values landing-reveal" data-reveal>
        <article><span>THE FOLIO KIT STANDARD</span><h3>Design with a point of view.</h3><p>Clear hierarchy, intentional typography, and motion that supports the story instead of competing with it.</p></article>
        <article><span>BUILT FOR REAL WORK</span><h3>Control without the busywork.</h3><p>Adapt the content, palette, and details from an organized foundation that is ready to become yours.</p></article>
        <article><span>STRAIGHTFORWARD OWNERSHIP</span><h3>Pay once. Build at your pace.</h3><p>Your purchase unlocks the exact version you bought with five protected download requests.</p></article>
      </section>

      <section className="closing-cta landing-reveal" data-reveal aria-labelledby="closing-cta-title">
        <div>
          <span className="eyebrow">Your next portfolio starts here</span>
          <h2 id="closing-cta-title">Give your best work<br />the frame it deserves.</h2>
        </div>
        <div>
          <p>Explore the full collection and find a theme that already feels close to you.</p>
          <Link to="/themes">Explore the collection <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </section>
    </main>
  </div>;
}
