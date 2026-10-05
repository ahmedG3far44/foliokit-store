import type { PublicAsset } from "../lib/types";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { FallbackImage } from "./fallback-image";

function GalleryImage({ asset, alt, eager = false }: { asset: PublicAsset; alt: string; eager?: boolean }) {
  const url = asset.variants?.at(-1)?.url ?? asset.url;
  return <FallbackImage src={url} alt={alt} loading="eager" fetchPriority={eager ? "high" : "auto"} decoding="async" draggable={false} />;
}

export function ThemeGallery({ images, name }: { images: PublicAsset[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const thumbnails = useRef<HTMLDivElement>(null);
  const openButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const titleId = useId();
  const slideId = useId();
  const active = Math.min(selected, Math.max(0, images.length - 1));
  const count = images.length;
  const move = (direction: number) => setSelected((current) => (Math.min(current, count - 1) + direction + count) % count);

  useEffect(() => {
    const strip = thumbnails.current;
    const thumbnail = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !thumbnail) return;
    const left = thumbnail.offsetLeft;
    if (left < strip.scrollLeft || left + thumbnail.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - strip.clientWidth / 2 + thumbnail.offsetWidth / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [active]);

  useEffect(() => {
    if (!expanded) return;
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal?.showModal();
    return () => { modal?.close(); document.body.style.overflow = previousOverflow; };
  }, [expanded]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => { setExpanded(false); setClosing(false); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const close = () => setClosing(true);
  const keyboard = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || count < 2) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  };
  const startSwipe = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    swiped.current = false;
  };
  const endSwipe = (event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || count < 2) return;
    const dx = touch.clientX - start.x;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(touch.clientY - start.y)) {
      swiped.current = true;
      move(dx < 0 ? 1 : -1);
    }
  };

  if (!count) return null;
  return <div className="theme-gallery" role="region" aria-roledescription="carousel" aria-label={`${name} image gallery`} onKeyDown={keyboard}>
    <div className="gallery-viewport" onTouchStart={startSwipe} onTouchEnd={endSwipe} onTouchCancel={() => { touchStart.current = null; }}>
      <div className="gallery-track" id={slideId} style={{ transform: `translateX(-${active * 100}%)` }}>
        {images.map((asset, index) => <div className="gallery-slide" key={asset.id} aria-hidden={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`}>
          <button ref={(button) => { openButtons.current[index] = button; }} className="gallery-open" type="button" tabIndex={index === active ? 0 : -1} onClick={() => {
            if (swiped.current) { swiped.current = false; return; }
            setSelected(index); setExpanded(true);
          }} aria-label={`View ${name} image ${index + 1} full size`}>
            <GalleryImage asset={asset} alt={`${name} — screen ${index + 1}`} eager={Math.abs(index - active) <= 1} />
            
          </button>
        </div>)}
      </div>
      {count > 1 && <>
        <button className="gallery-arrow gallery-arrow-prev" type="button" aria-label="Previous image" aria-controls={slideId} onClick={() => move(-1)}><ChevronLeft size={22} /></button>
        <button className="gallery-arrow gallery-arrow-next" type="button" aria-label="Next image" aria-controls={slideId} onClick={() => move(1)}><ChevronRight size={22} /></button>
      </>}
    </div>
    <div className="gallery-caption"><span>Screen {active + 1}</span><span aria-live="polite" aria-atomic="true">{String(active + 1).padStart(2, "0")} <span className="gallery-count-divider">/</span> {String(count).padStart(2, "0")}</span></div>
    {count > 1 && <div className="gallery-thumbnails" ref={thumbnails} role="group" aria-label="Choose a gallery image">
      {images.map((asset, index) => <button className="gallery-thumbnail" type="button" key={asset.id} aria-label={`Show image ${index + 1}`} aria-pressed={index === active} onClick={() => setSelected(index)}><GalleryImage asset={asset} alt="" /><span>{String(index + 1).padStart(2, "0")}</span></button>)}
    </div>}
    <dialog className={`gallery-lightbox${closing ? " is-closing" : ""}`} ref={dialog} aria-labelledby={titleId} onClose={() => { setExpanded(false); openButtons.current[active]?.focus({ preventScroll: true }); }} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="gallery-lightbox-panel">
        <header className="gallery-lightbox-header"><div><h2 id={titleId}>{name}</h2><p aria-live="polite">Screen {active + 1} of {count}</p></div><button type="button" className="gallery-lightbox-close" aria-label="Close full image preview" onClick={close} autoFocus><X size={22} /></button></header>
        <div className="gallery-lightbox-stage" onTouchStart={startSwipe} onTouchEnd={endSwipe} onTouchCancel={() => { touchStart.current = null; }}>
          {expanded && <div className="gallery-full-image" key={images[active].id}><GalleryImage asset={images[active]} alt={`${name} — full screen ${active + 1}`} eager /></div>}
        </div>
        <footer className="gallery-lightbox-footer"><span>Use arrow keys to browse · Esc to close</span>{count > 1 && <div><button type="button" className="gallery-lightbox-control" aria-label="Previous full image" onClick={() => move(-1)}><ChevronLeft size={20} /></button><button type="button" className="gallery-lightbox-control" aria-label="Next full image" onClick={() => move(1)}><ChevronRight size={20} /></button></div>}</footer>
      </div>
    </dialog>
  </div>;
}
