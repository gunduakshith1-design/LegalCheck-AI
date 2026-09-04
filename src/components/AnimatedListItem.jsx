import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';

/**
 * AnimatedListItem — subtle entrance animation for list rows.
 *
 * Fades and slides in when the item enters the viewport.
 * Respects prefers-reduced-motion via CSS.
 * Does not change the existing layout or content.
 *
 * Visibility never depends solely on IntersectionObserver: some mobile
 * browsers (e.g. iOS Safari) fail to deliver intersection callbacks, which
 * would otherwise leave rows stuck at opacity: 0. A short fallback timer
 * forces the row visible so content can never remain hidden.
 */
const AnimatedListItem = ({ children, index = 0, className = '' }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });

  // Fallback: if IntersectionObserver never reports the row in view,
  // reveal it shortly after mount regardless. On working browsers the
  // observer fires first and the entrance animation is unchanged.
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFallback(true), 500);
    return () => clearTimeout(t);
  }, []);

  const visible = isInView || fallback;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.04, 0.2),
        ease: 'easeOut',
      }}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedListItem;
