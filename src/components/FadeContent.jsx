import { useRef, useEffect, useState } from 'react';
import './FadeContent.css';

/**
 * FadeContent — subtle fade-in for meaningful state/content transitions.
 *
 * Uses CSS animations + IntersectionObserver (no GSAP dependency).
 * Respects prefers-reduced-motion.
 *
 * Mobile-safe mode: on coarse-pointer (touch) devices the entrance animation
 * is degraded to an opacity-only transition (no blur filter, no transform,
 * no will-change). Animating `filter: blur()` over a large subtree that
 * contains decoded images forces huge GPU layer promotion and has been
 * implicated in mobile compositor crashes (real-device white screen after
 * scan results arrive, while emulation passes). Desktop presentation is
 * unchanged.
 */
export default function FadeContent({
  children,
  blur = false,
  duration = 300,
  delay = 0,
  threshold = 0.1,
  className = '',
}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Coarse-pointer (touch/mobile) devices get the lightweight path.
  // Uses the same matchMedia pattern as prefers-reduced-motion — no UA sniffing.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setCoarsePointer(mq.matches);
    const handler = (e) => setCoarsePointer(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Fallback: if IntersectionObserver never reports the block in view (some
  // mobile browsers, e.g. iOS Safari, fail to deliver intersection callbacks),
  // reveal it shortly after mount regardless. On working browsers the observer
  // fires first and the entrance animation is unchanged.
  const [fallbackVisible, setFallbackVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFallbackVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, reducedMotion]);

  const visible = isVisible || fallbackVisible;
  // Lightweight mode: reduced-motion OR coarse-pointer (touch/mobile).
  const lightweight = reducedMotion || coarsePointer;

  const style = lightweight
    ? // Mobile / reduced-motion: opacity-only reveal — no blur filter, no
      // transform, no will-change (avoids large GPU layer promotion on the
      // result subtree on mobile devices).
      {
        opacity: visible ? 1 : 0,
        transition: `opacity ${duration}ms ease-out ${delay}ms`,
      }
    : {
        opacity: visible ? 1 : 0,
        filter: blur ? (visible ? 'blur(0px)' : 'blur(8px)') : 'none',
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms, filter ${duration}ms ease-out ${delay}ms`,
      };

  return (
    <div ref={ref} className={`fade-content ${className}`} style={style}>
      {children}
    </div>
  );
}
