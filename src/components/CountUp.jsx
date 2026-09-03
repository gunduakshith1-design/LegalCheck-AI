import { useRef, useEffect, useState } from 'react';
import { useInView, useMotionValue, useSpring } from 'framer-motion';

/**
 * CountUp — animated number counter for dashboard statistics.
 *
 * Uses framer-motion spring animation.
 * Respects prefers-reduced-motion.
 * Shows final value immediately when reduced motion is enabled.
 */
export default function CountUp({
  to,
  from = 0,
  duration = 1.2,
  className = '',
  separator = '',
  startWhen = true,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const motionValue = useMotionValue(from);
  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);
  const springValue = useSpring(motionValue, { damping, stiffness });

  const getDecimalPlaces = (num) => {
    const str = num.toString();
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (parseInt(decimals) !== 0) return decimals.length;
    }
    return 0;
  };

  const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = (latest) => {
    const hasDecimals = maxDecimals > 0;
    const options = {
      useGrouping: !!separator,
      minimumFractionDigits: hasDecimals ? maxDecimals : 0,
      maximumFractionDigits: hasDecimals ? maxDecimals : 0,
    };
    const formattedNumber = Intl.NumberFormat('en-US', options).format(latest);
    return separator ? formattedNumber.replace(/,/g, separator) : formattedNumber;
  };

  // Show final value immediately if reduced motion
  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = formatValue(reducedMotion ? to : from);
    }
  }, [from, to, reducedMotion]);

  // Animate when in view
  useEffect(() => {
    if (isInView && startWhen && !reducedMotion) {
      const timeoutId = setTimeout(() => {
        motionValue.set(to);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isInView, startWhen, motionValue, to, reducedMotion]);

  // Update displayed value on spring change
  useEffect(() => {
    if (reducedMotion) return;
    const unsubscribe = springValue.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = formatValue(latest);
      }
    });
    return () => unsubscribe();
  }, [springValue, formatValue, reducedMotion]);

  return <span className={className} ref={ref} aria-label={`${to}`} />;
}
