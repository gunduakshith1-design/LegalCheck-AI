import { useRef, useEffect, useState } from 'react';
import './FadeContent.css';

/**
 * FadeContent — subtle fade-in for meaningful state/content transitions.
 *
 * Uses CSS animations + IntersectionObserver (no GSAP dependency).
 * Respects prefers-reduced-motion.
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

  const style = reducedMotion
    ? {}
    : {
        opacity: isVisible ? 1 : 0,
        filter: blur ? (isVisible ? 'blur(0px)' : 'blur(8px)') : 'none',
        transform: isVisible ? 'translateY(0)' : 'translateY(6px)',
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms, filter ${duration}ms ease-out ${delay}ms`,
      };

  return (
    <div ref={ref} className={`fade-content ${className}`} style={style}>
      {children}
    </div>
  );
}
