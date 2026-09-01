// src/components/common/DocShieldLogo.tsx
import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '../ui';

interface DocShieldLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero' | number;
  animated?: boolean;
  interactive?: boolean;
  showText?: boolean;
  textVariant?: 'horizontal' | 'stacked';
  className?: string;
  glow?: boolean;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 64,
  xl: 96,
  hero: 140,
};

export const DocShieldLogo: React.FC<DocShieldLogoProps> = ({
  size = 'md',
  animated = true,
  interactive = true,
  showText = false,
  textVariant = 'horizontal',
  className,
  glow = true,
}) => {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 44;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 3D Parallax Tilt Physics
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 18, stiffness: 180, mass: 0.6 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [18, -18]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-18, 18]), springConfig);
  const scale = useSpring(isHovered ? 1.08 : 1, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'inline-flex items-center gap-3 select-none cursor-pointer',
        textVariant === 'stacked' && 'flex-col gap-1.5 text-center',
        className
      )}
      style={{ perspective: 800 }}
    >
      {/* 3D Holographic Moving Emblem */}
      <motion.div
        style={{
          width: pixelSize,
          height: pixelSize,
          rotateX: interactive ? rotateX : 0,
          rotateY: interactive ? rotateY : 0,
          scale: interactive ? scale : 1,
          transformStyle: 'preserve-3d',
        }}
        className="relative flex items-center justify-center flex-shrink-0"
      >
        {/* Ambient Neon Backglow */}
        {glow && (
          <motion.div
            animate={
              animated
                ? {
                    opacity: [0.35, 0.7, 0.35],
                    scale: [0.92, 1.12, 0.92],
                  }
                : {}
            }
            transition={{
              duration: 3.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-0 rounded-full blur-md pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(45,212,191,0.55) 0%, rgba(13,148,136,0.3) 50%, transparent 75%)',
            }}
          />
        )}

        {/* Laser Sweep Scan Effect */}
        {animated && (
          <motion.div
            animate={{
              top: ['-20%', '120%'],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: 'easeInOut',
              repeatDelay: 1.2,
            }}
            className="absolute left-0 right-0 h-[2px] z-20 pointer-events-none rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #2DD4BF, #FFFFFF, #2DD4BF, transparent)',
              boxShadow: '0 0 10px #2DD4BF, 0 0 20px #2DD4BF',
            }}
          />
        )}

        {/* Vector SVG Shield + Document + Checkmark Emblem */}
        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10 drop-shadow-[0_4px_12px_rgba(45,212,191,0.35)]"
        >
          <defs>
            {/* Holographic Cyan-Teal Gradient */}
            <linearGradient id="docshield-shield-grad" x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2DD4BF" />
              <stop offset="45%" stopColor="#14B8A6" />
              <stop offset="100%" stopColor="#0D9488" />
            </linearGradient>

            <linearGradient id="docshield-check-grad" x1="15" y1="30" x2="110" y2="90" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5EEAD4" />
              <stop offset="40%" stopColor="#2DD4BF" />
              <stop offset="100%" stopColor="#0F766E" />
            </linearGradient>

            <linearGradient id="docshield-doc-lines" x1="35" y1="25" x2="80" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0D9488" stopOpacity="0.6" />
            </linearGradient>

            <filter id="docshield-inner-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowDiff" />
              <feFlood floodColor="#2DD4BF" floodOpacity="0.5" />
              <feComposite in2="shadowDiff" operator="in" />
              <feComposite in2="SourceGraphic" operator="over" />
            </filter>
          </defs>

          {/* Outer Shield Frame with High-Tech Geometry */}
          <path
            d="M60 12 L96 26 C96 66 79 97 60 108 C41 97 24 66 24 26 L60 12 Z"
            fill="none"
            stroke="url(#docshield-shield-grad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Inner Document Body (Top-Folded Credential Blueprint) */}
          <path
            d="M38 32 H68 L80 44 V70 C80 70 70 70 60 70 C48 70 38 68 38 68 V32 Z"
            fill="none"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Folded Corner */}
          <path
            d="M68 32 V44 H80"
            fill="none"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Document Micro-Text Data Lines */}
          <line
            x1="46"
            y1="42"
            x2="62"
            y2="42"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="46"
            y1="50"
            x2="68"
            y2="50"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="46"
            y1="58"
            x2="58"
            y2="58"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Dynamic Bold Verified Checkmark (Overlaying & Cutting Through Shield) */}
          <motion.path
            d="M20 58 L46 84 L102 28"
            fill="none"
            stroke="url(#docshield-check-grad)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={animated ? { pathLength: 0.85, opacity: 0.95 } : undefined}
            animate={
              animated
                ? {
                    pathLength: [0.85, 1, 0.85],
                    opacity: [0.95, 1, 0.95],
                  }
                : undefined
            }
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Inner Checkmark White Core Highlight for 3D Specular Sheen */}
          <path
            d="M23 58 L46 81 L99 28"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        </svg>
      </motion.div>

      {/* Brand Typography (Optional) */}
      {showText && (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base font-sans tracking-tight text-[var(--text-1)] group-hover:text-[var(--accent)] transition-colors">
              DocShield
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--border-accent)] tracking-wider">
              AI
            </span>
          </div>
          <span className="text-[9px] font-mono text-[var(--text-3)] uppercase tracking-widest -mt-0.5">
            Border Security Enclave
          </span>
        </div>
      )}
    </div>
  );
};
