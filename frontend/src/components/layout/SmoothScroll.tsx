import React, { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '../../lib/animations';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/** §3 / §6.2 — Lenis smooth scroll synced with GSAP ScrollTrigger */
export const SmoothScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;

    const lenis = new Lenis({
      lerp: 0.09,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      prevent: (node: any) => {
        if (!node || typeof (node as HTMLElement).closest !== 'function') return false;
        const el = node as HTMLElement;
        return !!el.closest(
          '[data-lenis-prevent], .custom-scrollbar, .overflow-y-auto, .overflow-x-auto, [data-scrollable]'
        );
      },
    });

    lenis.on('scroll', ScrollTrigger.update);

    const ticker = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(ticker);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
};
