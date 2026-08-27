import { Variants } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/* §11 shared GSAP/Framer Motion variants — GSAP = scroll; FM = component/hover */

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const TRANSITION_DURATIONS = {
  micro: 0.15,
  fast: 0.25,
  standard: 0.4,
  emphasis: 0.6,
  ambient: 8,
} as const;

export const EASINGS = {
  security: [0.16, 1.0, 0.3, 1.0] as const,
  smooth: [0.25, 0.1, 0.25, 1.0] as const,
  pulse: [0.4, 0.0, 0.2, 1.0] as const,
  spring: { type: 'spring' as const, stiffness: 350, damping: 28 },
  springGentle: { type: 'spring' as const, stiffness: 200, damping: 22 },
};

/** §6.1 page load — headline word stagger */
export const heroHeadlineVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};

export const heroWordVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASINGS.security },
  },
};

/** §6.1 CTA spring overshoot */
export const ctaSpringVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 420, damping: 18 },
  },
};

/** §6.4 page transitions — 250–350ms */
export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASINGS.security },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: { duration: 0.26, ease: EASINGS.security },
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

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
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

/** §6.1 nav fades down */
export const navEntranceVariants: Variants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASINGS.security },
  },
};

/** §7 page header stagger (eyebrow → heading → copy → CTA) */
export const pageHeaderContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export const pageHeaderItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASINGS.security },
  },
};

/** §6.2 GSAP scroll reveal — transform/opacity only */
export function revealSection(el: HTMLElement, reduced: boolean) {
  if (reduced) {
    gsap.set(el, { opacity: 1, y: 0, rotateX: 0 });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0, y: 40 },
    {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    }
  );
}

/** §6.2 6-engine cards 3D tilt-in */
export function revealTiltCards(parent: HTMLElement, reduced: boolean) {
  const cards = parent.querySelectorAll<HTMLElement>('[data-tilt-card]');
  if (reduced) {
    gsap.set(cards, { opacity: 1, y: 0, rotateX: 0 });
    return;
  }
  gsap.fromTo(
    cards,
    { opacity: 0, y: 32, rotateX: 15 },
    {
      opacity: 1,
      y: 0,
      rotateX: 0,
      duration: 0.65,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: { trigger: parent, start: 'top 82%', once: true },
    }
  );
}
