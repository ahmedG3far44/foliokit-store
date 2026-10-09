import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "./header";

const heroBenefits = [
    "One-time purchase",
    "Production-ready source",
    "Five secure downloads",
];

function HeroSection() {
    return (
        <section className="sales-hero min-h-screen" aria-labelledby="hero-title">
            <Header />

            <div className="sales-hero-grid">
                <div className="sales-hero-copy sales-hero-copy-centered">

                    <h1 id="hero-title">
                        <span className="hero-fill-line hero-fill-primary">Portfolio templates.</span>{" "}
                        <span className="hero-fill-line hero-fill-accent">Make your first impression count.</span>
                    </h1>

                    <p>
                        Distinctive, production-ready portfolio themes for designers, developers,
                        and creative studios. Start with a polished foundation, make it yours, and
                        launch without the blank-page spiral.
                    </p>

                    <div className="sales-hero-actions">
                        <Link className="sales-hero-primary" to="/themes">
                            Find your theme <ArrowRight size={18} aria-hidden="true" />
                        </Link>
                        <a className="sales-hero-secondary" href="#featured-themes">
                            View featured themes
                        </a>
                    </div>

                    <ul className="sales-hero-benefits" aria-label="Purchase benefits">
                        {heroBenefits.map((benefit) => (
                            <li key={benefit}>
                                <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                                {benefit}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}

export default HeroSection;
