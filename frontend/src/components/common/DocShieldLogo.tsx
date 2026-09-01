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
  const scale = useSpring(isHovered ? 1.1 : 1, springConfig);

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
                    opacity: [0.4, 0.8, 0.4],
                    scale: [0.95, 1.15, 0.95],
                  }
                : {}
            }
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-0 rounded-full blur-md pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(45,212,191,0.65) 0%, rgba(13,148,136,0.35) 50%, transparent 75%)',
            }}
          />
        )}

        {/* Laser Sweep Scan Effect */}
        {animated && (
          <motion.div
            animate={{
              top: ['-20%', '120%'],
              opacity: [0, 0.9, 0],
            }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: 'easeInOut',
              repeatDelay: 1.2,
            }}
            className="absolute left-0 right-0 h-[2px] z-20 pointer-events-none rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #2DD4BF, #FFFFFF, #2DD4BF, transparent)',
              boxShadow: '0 0 12px #2DD4BF, 0 0 24px #2DD4BF',
            }}
          />
        )}

        {/* Vector SVG Shield + Document + Enhanced Large Bold Checkmark */}
        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10 drop-shadow-[0_4px_14px_rgba(45,212,191,0.4)]"
        >
          <defs>
            {/* Holographic Shield Gradient */}
            <linearGradient id="docshield-shield-grad" x1="18" y1="10" x2="102" y2="112" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2DD4BF" />
              <stop offset="50%" stopColor="#14B8A6" />
              <stop offset="100%" stopColor="#0D9488" />
            </linearGradient>

            {/* High-Impact Vibrant Checkmark Gradient */}
            <linearGradient id="docshield-check-grad" x1="10" y1="20" x2="115" y2="90" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A7F3D0" />
              <stop offset="25%" stopColor="#2DD4BF" />
              <stop offset="70%" stopColor="#14B8A6" />
              <stop offset="100%" stopColor="#0F766E" />
            </linearGradient>

            {/* Document Lines Gradient */}
            <linearGradient id="docshield-doc-lines" x1="35" y1="24" x2="80" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#0D9488" stopOpacity="0.75" />
            </linearGradient>

            {/* Drop Shadow for Popout 3D Effect */}
            <filter id="docshield-check-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#041E1A" floodOpacity="0.65" />
            </filter>
          </defs>

          {/* Outer Shield Frame (Clean Cyber-Sentinel Curvature) */}
          <path
            d="M60 10 L98 25 C98 68 81 99 60 110 C39 99 22 68 22 25 L60 10 Z"
            fill="none"
            stroke="url(#docshield-shield-grad)"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Inner Document Body (Top-Right Folded Security Credential) */}
          <path
            d="M38 30 H67 L79 42 V68 C79 68 70 68 60 68 C48 68 38 66 38 66 V30 Z"
            fill="none"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Folded Corner */}
          <path
            d="M67 30 V42 H79"
            fill="none"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Document Micro-Data Lines */}
          <line
            x1="45"
            y1="40"
            x2="61"
            y2="40"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <line
            x1="45"
            y1="48"
            x2="69"
            y2="48"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <line
            x1="45"
            y1="56"
            x2="59"
            y2="56"
            stroke="url(#docshield-doc-lines)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* Enhanced Large Bold Verified Checkmark (Prominent, High-Contrast & Powerful) */}
          <motion.path
            d="M13 55 L45 88 L108 19"
            fill="none"
            stroke="url(#docshield-check-grad)"
            strokeWidth="13.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#docshield-check-shadow)"
            initial={animated ? { pathLength: 0.9, opacity: 0.95 } : undefined}
            animate={
              animated
                ? {
                    pathLength: [0.9, 1, 0.9],
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

          {/* Inner Checkmark Specular Core Highlight (Gives Crisp 3D Bevel & Luminance) */}
          <path
            d="M16 55 L45 84 L105 19"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
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
