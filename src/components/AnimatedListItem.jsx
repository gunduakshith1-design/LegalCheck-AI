import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/**
 * AnimatedListItem — subtle entrance animation for list rows.
 *
 * Fades and slides in when the item enters the viewport.
 * Respects prefers-reduced-motion via CSS.
 * Does not change the existing layout or content.
 */
const AnimatedListItem = ({ children, index = 0, className = '' }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
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
