import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { Link } from "react-router-dom";

import Header from "./header";

const previews = [
  { title: "Objects of intention", type: "Designer portfolio", image: "/images/hero-1.jpg", tone: "sand" },
  { title: "Make it move.", type: "Motion designer", image: "/images/hero-2.jpg", tone: "dark" },
  { title: "Selected works", type: "Developer portfolio", image: "/images/hero-6.gif", tone: "blue" },
  { title: "Stories in stillness", type: "Photography", image: "/images/hero-3.jpg", tone: "photo" },
  { title: "Studio North", type: "Digital agency", image: "/images/hero-4.jpg", tone: "green" },
  { title: "Good things, together", type: "Creative studio", image: "/images/hero-5.jpg", tone: "pink" },
  { title: "Form & Function", type: "Online storefront", image: "/images/hero-7.png", tone: "cream" },
  { title: "Nook — your ideas, in flow", type: "SaaS landing page", image: "/images/hero-8.jpg", tone: "stone" },
  { title: "A quieter kind of space", type: "Developer portfolio", image: "/images/hero-9.jpg", tone: "saas" },
  { title: "Project X", type: "Photography", image: "/images/hero-10.jpg", tone: "photo" },
  { title: "The Film Edit", type: "Videographer", image: "/images/hero-11.jpg", tone: "blue" },
];

const wrap = (value: number, range: number) => ((value % range) + range) % range;

function ThemeCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const frameRef = useRef(0);
  const dragRef = useRef({ active: false, x: 0, lastX: 0, velocity: 0, lastTime: 0 });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let previous = performance.now();
    let width = window.innerWidth;
    let height = window.innerHeight;
    const resize = () => { width = window.innerWidth; height = window.innerHeight; };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(track);
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const mobile = width <= 820;
      const unit = mobile ? width / 640 : Math.min(width / 1440, height / 1080);
      const pitch = (mobile ? 126 : 196) * unit;
      const radius = pitch * previews.length;
      const center = width / 2;
      const carouselTop = height * (mobile ? (width <= 440 ? 0.43 : 0.42) : 0.46);
      const baseY = height * (mobile ? 0.69 : 687 / 1080) - carouselTop;
      if (visible && !reduced.matches) {
        if (dragRef.current.active) {
          const drag = dragRef.current;
          const elapsed = Math.max(now - drag.lastTime, 1);
          drag.velocity = ((drag.x - drag.lastX) / elapsed) * 1000;
          drag.lastX = drag.x;
          drag.lastTime = now;
        } else if (Math.abs(dragRef.current.velocity) > 1) {
          offsetRef.current -= dragRef.current.velocity * dt;
          dragRef.current.velocity *= Math.pow(0.05, dt);
        } else {
          offsetRef.current += 50 * unit * dt;
        }
      }

      const cards = track.querySelectorAll<HTMLElement>(".theme-arch-card");
      cards.forEach((card, index) => {
        let t = index * pitch - wrap(offsetRef.current, radius);
        if (t < -radius / 2) t += radius;
        if (t > radius / 2) t -= radius;
        const d = Math.abs(t) / (mobile ? width * 0.49 : 706 * unit);
        const pushed = t * (1 + 0.083 * Math.pow(t / (706 * unit), 2));
        const cardWidth = (mobile ? 142 + 26 * d * d : 170 + 48 * d * d) * unit;
        const leftQ = Math.min(Math.abs((t - cardWidth / 2) / (mobile ? width * 0.49 : 706 * unit)), 1.2);
        const rightQ = Math.min(Math.abs((t + cardWidth / 2) / (mobile ? width * 0.49 : 706 * unit)), 1.2);
        const leftH = (mobile ? 178 + 54 * Math.pow(leftQ, 2.6) : 280 + 92 * Math.pow(leftQ, 2.6)) * unit;
        const rightH = (mobile ? 178 + 54 * Math.pow(rightQ, 2.6) : 280 + 92 * Math.pow(rightQ, 2.6)) * unit;
        const dCenter = Math.min(d, 1.25);
        const y = baseY - 12 * dCenter * dCenter * unit;
        const tilt = Math.max(-7, Math.min(7, (t / (706 * unit)) * 7));
        card.style.width = `${cardWidth}px`;
        card.style.height = `${Math.max(leftH, rightH)}px`;
        card.style.left = `${center + pushed - cardWidth / 2}px`;
        card.style.top = `${y - Math.max(leftH, rightH) / 2}px`;
        const leftInset = ((Math.max(leftH, rightH) - leftH) / Math.max(leftH, rightH)) * 50;
        const rightInset = ((Math.max(leftH, rightH) - rightH) / Math.max(leftH, rightH)) * 50;
        card.style.clipPath = `polygon(0 ${leftInset}%, 100% ${rightInset}%, 100% ${100 - rightInset}%, 0 ${100 - leftInset}% round 15px)`;
        card.style.transform = `rotate(${tilt}deg)`;
        card.style.zIndex = String(1000 - Math.round(d * 100));
      });
      frameRef.current = requestAnimationFrame(render);
    };
    frameRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a,button")) return;
    dragRef.current = { active: true, x: event.clientX, lastX: event.clientX, velocity: 0, lastTime: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-dragging");
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const delta = event.clientX - dragRef.current.x;
    dragRef.current.x = event.clientX;
    offsetRef.current -= delta;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false;
    event.currentTarget.classList.remove("is-dragging");
  };

  return <div className="theme-arch" aria-label="Curved gallery of website templates" role="region">
    <div ref={trackRef} className="theme-arch-track" tabIndex={0} role="group" aria-label="Drag or use arrow keys to browse template previews" onKeyDown={(event) => { if (event.key === "ArrowLeft") offsetRef.current += 48; if (event.key === "ArrowRight") offsetRef.current -= 48; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {previews.map((preview) => <article className={`theme-arch-card tone-${preview.tone}`} key={preview.title} aria-label={`${preview.type}: ${preview.title}`}>
        {preview.image ? <img className="w-full h-full object-cover" src={preview.image} alt="" draggable="false" /> : preview.tone === "saas" ? <div className="mock-site mock-saas" aria-hidden="true"><div className="mock-nav">nook<span>Product&nbsp;&nbsp; Pricing</span></div><div className="saas-copy"><b>Ideas move<br />better together.</b><small>One calm space for your team's best work.</small><i>Get started →</i></div><div className="saas-window"><div className="saas-window-top">◉&nbsp; Team workspace <span>···</span></div><div className="saas-window-row"><b>Website refresh</b><span>82%</span></div><div className="saas-progress"><i /></div><div className="saas-window-row"><b>Launch checklist</b><span>6 tasks</span></div><div className="saas-tasks"><i /><i /><i /></div></div></div> : <div className="mock-site" aria-hidden="true"><div className="mock-nav">MAYA STUDIO <span>WORK&nbsp;&nbsp; ABOUT</span></div><div className="mock-title">Ideas into<br /><i>identity.</i></div><div className="mock-art"><b>FORM<br />FOLLOWS<br />FEELING</b><span>✳</span></div><div className="mock-foot">INDEPENDENT DESIGNER · AVAILABLE FOR SELECT PROJECTS</div></div>}
      </article>)}
    </div>
  </div>;
}

function HeroSection() {
  return <section className="sales-hero folio-hero" aria-labelledby="hero-title">
    <Header />
    <div className="folio-hero-copy ">
      <h1 id="hero-title">
        <span className="folio-headline-line"><span className="folio-fill folio-fill-ink">Your Next</span><span className="folio-fill folio-fill-brand">Portfolio</span></span>
        <span className="folio-headline-line"><span className="folio-fill folio-fill-ink">Starts</span><span className="folio-fill folio-fill-brand">Right Here.</span></span>
      </h1>
      <p>Discover beautifully crafted website templates for your next big idea.<br className="desktop-break" /> From creative portfolios to agency websites and online stores,<br className="desktop-break" /> find your style and launch with confidence.</p>
    </div>
    <svg className="folio-doodle folio-slashes" viewBox="0 0 72 48" aria-hidden="true"><path d="M12 40 30 9M40 42 58 11" /></svg>
    <div className="folio-note folio-note-right">Make it<br />yours!<svg viewBox="0 0 260 105" aria-hidden="true"><path d="M5 7C63 23 126 14 157 43s34 43 75 34m-1 0-20-8m20 8-18 12" /></svg></div>
    <ThemeCarousel />
    <div className="folio-cta-wrap"><Link className="sales-hero-primary folio-hero-cta" to="/themes">Explore Templates <ArrowRight size={18} aria-hidden="true" /></Link><span className="folio-cta-ring" aria-hidden="true" /></div>
    <div className="folio-note folio-note-bottom">No coding needed<svg viewBox="0 0 130 55" aria-hidden="true"><path d="M4 5c32 2 53 17 76 32m0 0-18-3m18 3-4-17" /></svg></div>
  </section>;
}

export default HeroSection;
