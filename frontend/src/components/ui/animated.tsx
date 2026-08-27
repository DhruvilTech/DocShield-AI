import React, { useEffect, useRef } from 'react';
import { animate, motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { gsap, revealSection, revealTiltCards, pageHeaderContainer, pageHeaderItem } from '../../lib/animations';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

/* ---- §6.2 Count-up stat ---- */
interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export const CountUp: React.FC<CountUpProps> = ({
  value,
  duration = 1.2,
  className,
  prefix = '',
  suffix = '',
  decimals = 0,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      mv.set(value);
      return;
    }
    const ctrl = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => ctrl.stop();
  }, [inView, value, duration, reduced, mv]);

  useEffect(() => {
    const unsub = mv.on('change', (v) => {
      if (!ref.current) return;
      const n = decimals ? v.toFixed(decimals) : Math.round(v);
      const formatted =
        typeof n === 'string'
          ? Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
          : n.toLocaleString();
      ref.current.textContent = `${prefix}${formatted}${suffix}`;
    });
    return unsub;
  }, [mv, prefix, suffix, decimals]);

  return (
    <span ref={ref} className={className} aria-live="polite">
      {prefix}
      {reduced || !inView ? (decimals ? value.toFixed(decimals) : value.toLocaleString()) : '0'}
      {suffix}
    </span>
  );
};

/* ---- §6.3 Magnetic hover (pointer devices only) ---- */
export const MagneticButton: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 280, damping: 18 });
  const y = useSpring(0, { stiffness: 280, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    if (reduced || window.matchMedia('(pointer: coarse)').matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.22);
    y.set((e.clientY - r.top - r.height / 2) * 0.22);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn('inline-flex', className)}
    >
      {children}
    </motion.div>
  );
};

/* ---- §6.3 / §8 GlowTag breathing pills ---- */
export const GlowTag: React.FC<{
  children: React.ReactNode;
  color?: 'teal' | 'violet' | 'blue' | 'amber' | 'red' | 'green';
  className?: string;
}> = ({ children, color = 'teal', className }) => {
  const map = {
    teal: 'text-[#2DD4BF] border-[#2DD4BF]/35 bg-[#2DD4BF]/10 shadow-[0_0_18px_rgba(45,212,191,0.18)]',
    violet: 'text-[#7C5CFC] border-[#7C5CFC]/35 bg-[#7C5CFC]/10 shadow-[0_0_18px_rgba(124,92,252,0.18)]',
    blue: 'text-[#3B82F6] border-[#3B82F6]/35 bg-[#3B82F6]/10 shadow-[0_0_18px_rgba(59,130,246,0.18)]',
    amber: 'text-[#F5A623] border-[#F5A623]/35 bg-[#F5A623]/10 shadow-[0_0_18px_rgba(245,166,35,0.18)]',
    red: 'text-[#FB4A4A] border-[#FB4A4A]/35 bg-[#FB4A4A]/10 shadow-[0_0_18px_rgba(251,74,74,0.18)]',
    green: 'text-[#34D399] border-[#34D399]/35 bg-[#34D399]/10 shadow-[0_0_18px_rgba(52,211,153,0.18)]',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono animate-tag-breathe', map[color], className)}>
      {children}
    </span>
  );
};

/* ---- §6.3 Animated glass card with magnetic lift ---- */
export const AnimatedCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  tilt?: boolean;
}> = ({ children, className, tilt }) => (
  <div
    data-tilt-card={tilt ? '' : undefined}
    className={cn(
      'rounded-[18px] border border-[var(--border-hairline)] bg-[var(--glass-fill)] backdrop-blur-xl',
      'transition-all duration-200 card-magnetic',
      className
    )}
  >
    {children}
  </div>
);

/* ---- §6.2 GSAP scroll reveal wrapper ---- */
export const Reveal: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    revealSection(el, reduced);
    return () => {
      gsap.killTweensOf(el);
    };
  }, [reduced]);
  return (
    <div ref={ref} className={className} style={{ transformStyle: 'preserve-3d' }}>
      {children}
    </div>
  );
};

/* ---- §6.2 GSAP staggered tilt reveal wrapper ---- */
export const RevealTilt: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    revealTiltCards(el, reduced);
    return () => {
      const cards = el.querySelectorAll('[data-tilt-card]');
      gsap.killTweensOf(cards);
    };
  }, [reduced]);
  return (
    <div ref={ref} className={className} style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}>
      {children}
    </div>
  );
};

/* ---- §7 page header pattern ---- */
export const PageHeader: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <motion.div
    variants={pageHeaderContainer}
    initial="hidden"
    animate="visible"
    className="flex flex-wrap items-end justify-between gap-4 mb-8"
  >
    <div className="max-w-2xl">
      <motion.p variants={pageHeaderItem} className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)] mb-2 font-mono">
        {eyebrow}
      </motion.p>
      <motion.h1 variants={pageHeaderItem} className="text-2xl sm:text-4xl font-semibold text-[var(--text-1)] tracking-tight font-display">
        {title}
      </motion.h1>
      {description && (
        <motion.p variants={pageHeaderItem} className="mt-2 text-sm text-[var(--text-2)] max-w-xl leading-relaxed">
          {description}
        </motion.p>
      )}
    </div>
    {actions && <motion.div variants={pageHeaderItem}>{actions}</motion.div>}
  </motion.div>
);

/* ---- §8 SVG check draw-in ---- */
export const CheckDraw: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={cn('w-3.5 h-3.5 text-[var(--safe)]', className)} fill="none" viewBox="0 0 20 20" aria-hidden>
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" className="check-circle" />
    <path d="M6.5 10.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="check-mark" />
  </svg>
);
