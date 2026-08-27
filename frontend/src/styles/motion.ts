import { Variants } from 'framer-motion';

/* ============================================
   DocShield AI — Motion Design System Tokens
   Living Security Intelligence Network
   ============================================ */

export const TRANSITION_DURATIONS = {
  micro:    0.15, // 150ms - toggles, button clicks, status dots
  fast:     0.25, // 250ms - hover states, tooltips, small popovers
  standard: 0.40, // 400ms - card transitions, tab switching, reveals
  emphasis: 0.60, // 600ms - modal reveals, scanning phase shifts
  ambient:  8.00, // 8s - ambient data pulses, radar sweeps
} as const;

export const EASINGS = {
  // Security crisp ease-out
  security:   [0.16, 1.0, 0.3, 1.0] as const,
  smooth:     [0.25, 0.1, 0.25, 1.0] as const,
  pulse:      [0.4, 0.0, 0.2, 1.0] as const,
  spring:     { type: 'spring', stiffness: 350, damping: 28 },
  springGentle: { type: 'spring', stiffness: 200, damping: 22 },
};

/* ---- Framer Motion Reusable Variants ---- */

export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: TRANSITION_DURATIONS.standard, ease: EASINGS.security },
  },
};

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: TRANSITION_DURATIONS.standard, ease: EASINGS.security },
  },
};

export const fadeScaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: TRANSITION_DURATIONS.standard, ease: EASINGS.security },
  },
};

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

export const staggerChildVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: TRANSITION_DURATIONS.standard, ease: EASINGS.security },
  },
};

export const cardHoverVariants: Variants = {
  initial: { y: 0 },
  hover: {
    y: -3,
    transition: { duration: TRANSITION_DURATIONS.fast, ease: EASINGS.security },
  },
};

export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: EASINGS.security },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.18, ease: EASINGS.security },
  },
};

export const radarPulseVariants: Variants = {
  initial: { scale: 0.8, opacity: 0.8 },
  animate: {
    scale: 2.2,
    opacity: 0,
    transition: {
      duration: 2.4,
      repeat: Infinity,
      ease: 'easeOut',
    },
  },
};

export const threatBlinkVariants: Variants = {
  animate: (severity: string) => {
    const duration = severity === 'critical' ? 1.0 : severity === 'high' ? 1.6 : 2.4;
    return {
      opacity: [1, 0.35, 1],
      scale: [1, 1.08, 1],
      transition: {
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    };
  },
};
