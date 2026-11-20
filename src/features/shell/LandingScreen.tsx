import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./landing.css";

// Deliberately leave the reading area empty; coordinates are relative to the surface.
const BUBBLES = [
  { x: 7, y: 15, size: 136 },
  { x: 20, y: 8, size: 54 },
  { x: 32, y: 15, size: 24 },
  { x: 3, y: 44, size: 72 },
  { x: 16, y: 37, size: 34 },
  { x: 17, y: 66, size: 112 },
  { x: 2, y: 78, size: 40 },
  { x: 29, y: 86, size: 64 },
  { x: 10, y: 97, size: 184 },
  { x: 73, y: 8, size: 78 },
  { x: 91, y: 20, size: 164 },
  { x: 98, y: 42, size: 68 },
  { x: 82, y: 40, size: 38 },
  { x: 90, y: 66, size: 104 },
  { x: 75, y: 79, size: 52 },
  { x: 96, y: 97, size: 192 },
  { x: 63, y: 91, size: 28 },
  { x: 44, y: 98, size: 44 },
];

const REPULSION_RADIUS = 180;
const MAX_OFFSET = 76;
const MAX_SPEED = 180;

export function LandingScreen({ onEnter }: { onEnter: () => void }) {
  const surfaceRef = useRef<HTMLElement>(null);
  const bubblesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    const field = bubblesRef.current;
    if (!surface || !field) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const elements = Array.from(field.querySelectorAll<HTMLSpanElement>("[data-bubble]"));
    const bodies = elements.map((element, index) => ({
      element, anchor: BUBBLES[index], x: 0, y: 0, vx: 0, vy: 0,
    }));
    let bounds = field.getBoundingClientRect();
    let pointer = { x: 0, y: 0, active: false };
    let frame: number | null = null;
    let lastTime: number | null = null;
    let disposed = false;

    const canAnimate = () => !disposed && !reducedMotion.matches && finePointer.matches && !document.hidden;

    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    };

    const reset = () => {
      stop();
      pointer.active = false;
      for (const body of bodies) {
        body.x = body.y = body.vx = body.vy = 0;
        body.element.style.removeProperty("transform");
      }
    };

    const tick = (time: number) => {
      frame = null;
      if (!canAnimate()) return;
      // Seconds-based integration, capped after stalls and substepped for stable springs.
      const elapsed = lastTime === null ? 1 / 60 : Math.min((time - lastTime) / 1000, 1 / 30);
      lastTime = time;
      const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
      const dt = elapsed / steps;
      const limit = Math.min(MAX_OFFSET, bounds.width * 0.12);
      let moving = false;

      for (const [index, body] of bodies.entries()) {
        for (let step = 0; step < steps; step++) {
          let fx = 0;
          let fy = 0;
          if (pointer.active) {
            const dx = bounds.width * body.anchor.x / 100 + body.x - pointer.x;
            const dy = bounds.height * body.anchor.y / 100 + body.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < REPULSION_RADIUS) {
              const force = 2600 * (1 - distance / REPULSION_RADIUS) ** 2;
              // An exact center hit gets a stable direction, never a divide-by-zero.
              const angle = index * 2.39996;
              fx = (distance > 0.01 ? dx / distance : Math.cos(angle)) * force;
              fy = (distance > 0.01 ? dy / distance : Math.sin(angle)) * force;
            }
          }
          const damping = Math.exp(-8 * dt);
          body.vx = (body.vx + (-28 * body.x + fx) * dt) * damping;
          body.vy = (body.vy + (-28 * body.y + fy) * dt) * damping;
          const speed = Math.hypot(body.vx, body.vy);
          if (speed > MAX_SPEED) {
            body.vx *= MAX_SPEED / speed;
            body.vy *= MAX_SPEED / speed;
          }
          body.x += body.vx * dt;
          body.y += body.vy * dt;
          const offset = Math.hypot(body.x, body.y);
          if (offset > limit) {
            const nx = body.x / offset;
            const ny = body.y / offset;
            body.x = nx * limit;
            body.y = ny * limit;
            const outward = Math.max(0, body.vx * nx + body.vy * ny);
            body.vx -= outward * nx;
            body.vy -= outward * ny;
          }
        }
        const atRest = Math.hypot(body.x, body.y) < 0.025 && Math.hypot(body.vx, body.vy) < 0.025;
        if (atRest) {
          body.x = body.y = body.vx = body.vy = 0;
          body.element.style.removeProperty("transform");
        } else {
          moving = true;
          body.element.style.transform = `translate3d(${body.x.toFixed(3)}px, ${body.y.toFixed(3)}px, 0) translate(-50%, -50%)`;
        }
      }
      if (moving) frame = requestAnimationFrame(tick);
      else lastTime = null;
    };

    const wake = () => {
      if (frame === null && canAnimate()) frame = requestAnimationFrame(tick);
    };
    const release = () => {
      pointer.active = false;
      wake();
    };
    const move = (event: PointerEvent) => {
      // No touch capture or preventDefault: tapping the CTA and scrolling stay native.
      if (event.pointerType === "touch" || !canAnimate()) return;
      bounds = field.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, active: true };
      wake();
    };
    const resize = () => {
      bounds = field.getBoundingClientRect();
      reset();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(field);
    surface.addEventListener("pointermove", move, { passive: true });
    surface.addEventListener("pointerleave", release);
    surface.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    window.addEventListener("scroll", release, true);
    document.addEventListener("visibilitychange", reset);
    reducedMotion.addEventListener("change", reset);
    finePointer.addEventListener("change", reset);

    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", release);
      surface.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      window.removeEventListener("scroll", release, true);
      document.removeEventListener("visibilitychange", reset);
      reducedMotion.removeEventListener("change", reset);
      finePointer.removeEventListener("change", reset);
    };
  }, []);

  return (
    <main className="gw-landing" ref={surfaceRef}>
      <div className="gw-landing__bubbles" ref={bubblesRef} aria-hidden="true">
        {BUBBLES.map((bubble, index) => (
          <span
            key={index}
            data-bubble
            className="gw-landing__bubble"
            style={{
              left: `${bubble.x}%`,
              top: `${bubble.y}%`,
              width: `clamp(${bubble.size * 0.55}px, ${bubble.size / 14.4}vw, ${bubble.size}px)`,
            }}
          />
        ))}
      </div>

      <header className="gw-landing__header">
        <span className="gw-landing__wordmark">GEWU <span>/</span> PHYSICS</span>
        <span className="gw-landing__header-note">观察 · 推演 · 理解</span>
      </header>

      <section className="gw-landing__hero" aria-labelledby="gw-landing-title">
        <p className="gw-landing__eyebrow">物理解题动画助手</p>
        <h1 id="gw-landing-title" className="gw-landing__title">格物</h1>
        <p className="gw-landing__tagline">让抽象的物理，成为看得见的过程。</p>
        <Button type="button" className="gw-landing__enter" onClick={onEnter}>
          进入学习空间
          <ArrowRight className="gw-landing__arrow" aria-hidden="true" />
        </Button>
      </section>

      <footer className="gw-landing__footer">
        <span className="gw-landing__footer-rule" aria-hidden="true" />
        <p>题目识别<span aria-hidden="true">/</span>交互动画<span aria-hidden="true">/</span>分步题解</p>
      </footer>
    </main>
  );
}
