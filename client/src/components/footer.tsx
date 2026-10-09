import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import type { SiteContentType } from "../lib/types";
import { Logo } from "./header";
import { PaymentProviderMark } from "./payment-provider-mark";

export default function Footer() {
  const year = new Date().getFullYear();
  const [socials, setSocials] = useState<SiteContentType["socials"]>({
    instagram: "",
    tiktok: "",
    youtube: "",
    linkedin: "",
  });

  useEffect(() => {
    api.get<SiteContentType>("/content").then((data) => {
      if (data?.socials) setSocials({
        instagram: data.socials.instagram ?? "",
        tiktok: data.socials.tiktok ?? "",
        youtube: data.socials.youtube ?? "",
        linkedin: data.socials.linkedin,
      });
    }).catch(() => undefined);
  }, []);

  return (
    <footer className="site-footer" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="site-footer-inner">
        <div className="footer-grid">
          {/* Brand + description + socials */}
          <div className="footer-brand-col">
            <Logo />
            <p className="footer-desc">
              Curated portfolio themes for creators, designers and developers. Production-ready templates with clean code, thoughtful interactions and practical guides to launch fast.
            </p>
            <div className="footer-socials" aria-label="Social media">
              {socials.instagram && (
                <a href={socials.instagram} target="_blank" rel="noreferrer" aria-label="Instagram">
                  <img src="/social/instagram.png" alt="" width={20} height={20} />
                </a>
              )}
              {socials.youtube && (
                <a href={socials.youtube} target="_blank" rel="noreferrer" aria-label="YouTube Shorts">
                  <img src="/social/youtube-shorts.png" alt="" width={20} height={20} />
                </a>
              )}
              {socials.tiktok && (
                <a href={socials.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok">
                  <img src="/social/tiktok.png" alt="" width={20} height={20} />
                </a>
              )}
            </div>
          </div>

          {/* Explore */}
          <nav className="footer-nav" aria-label="Explore">
            <h3>Explore</h3>
            <Link to="/themes">Themes</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact us</Link>
          </nav>

          {/* Legal */}
          <nav className="footer-nav" aria-label="Legal">
            <h3>Legal</h3>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/refund">Refund Policy</Link>
          </nav>

          {/* Payments */}
          <div className="footer-payments">
            <h3>Payments</h3>
            <p>Secure checkout with Stripe or PayPal. All transactions encrypted.</p>
            <div className="payment-groups">
              <div className="payment-provider-block">

                <div className="payment-badges" aria-label="Accepted payment methods">
                  <span className="pay-badge" title="Visa" aria-label="Visa"><img src="/payments/visa.png" alt="" width={40} height={24} /></span>
                  <span className="pay-badge" title="Mastercard" aria-label="Mastercard"><img src="/payments/mastercard.png" alt="" width={40} height={24} /></span>
                  <span className="pay-badge" title="Google Pay" aria-label="Google Pay"><img src="/providers/google.svg" alt="" width={40} height={24} /></span>
                  <span className="pay-badge" title="Apple Pay" aria-label="Apple Pay"><img src="/providers/apple.svg" alt="" width={40} height={24} /></span>
                  <span className="pay-badge" title="Stripe" aria-label="Stripe"><PaymentProviderMark provider="stripe" /></span>
                  <span className="pay-badge" title="PayPal" aria-label="PayPal"><PaymentProviderMark provider="paypal" /></span>

                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} Folio Kit. All rights reserved.</span>
          <span className="footer-dot" aria-hidden="true">·</span>
          <span>
            Developed by{" "}
            <Link to={"https://linkedin.com/in/ahmedg3far44"} target="_blank" rel="noreferrer">
              @ahmedG3far44
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
