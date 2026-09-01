import React, { useState, useRef, useCallback } from 'react';
import { cn } from './index';

interface CyberHUDCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  glowColor?: 'teal' | 'amber' | 'red' | 'violet';
  showTelemetry?: boolean;
}

export const CyberHUDCard: React.FC<CyberHUDCardProps> = ({
  children,
  className = '',
  glowColor = 'teal',
  showTelemetry = true,
  ...props
}) => {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    setCoords({ x, y });
  }, []);

  const colorMap = {
    teal: {
      border: 'border-[var(--border-accent)]',
      glow: 'rgba(45, 212, 191, 0.25)',
      accent: 'text-[var(--accent)]',
      runner: 'from-[var(--accent)]',
    },
    amber: {
      border: 'border-[#F59E0B]/40',
      glow: 'rgba(245, 158, 11, 0.25)',
      accent: 'text-[#F59E0B]',
      runner: 'from-[#F59E0B]',
    },
    red: {
      border: 'border-[#EF4444]/40',
      glow: 'rgba(239, 68, 68, 0.25)',
      accent: 'text-[#EF4444]',
      runner: 'from-[#EF4444]',
    },
    violet: {
      border: 'border-[#7C5CFC]/40',
      glow: 'rgba(124, 92, 252, 0.25)',
      accent: 'text-[#7C5CFC]',
      runner: 'from-[#7C5CFC]',
    },
  }[glowColor];

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      className={cn(
        'group relative rounded-2xl border bg-[var(--surface)]/70 backdrop-blur-xl transition-all duration-300 overflow-hidden',
        isHovered ? `${colorMap.border} shadow-[0_0_30px_${colorMap.glow}] scale-[1.01]` : 'border-[var(--border)] shadow-[var(--shadow-sm)]',
        className
      )}
      {...props}
    >
      {/* 1. Laser Runner Border on Hover */}
      {isHovered && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent animate-laser-runner" />
          <div className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent animate-laser-runner" />
        </div>
      )}

      {/* 2. Four Corner HUD Reticles */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[var(--accent)] transition-all duration-300 group-hover:w-4 group-hover:h-4 group-hover:border-[var(--accent-bright)] z-20" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[var(--accent)] transition-all duration-300 group-hover:w-4 group-hover:h-4 group-hover:border-[var(--accent-bright)] z-20" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[var(--accent)] transition-all duration-300 group-hover:w-4 group-hover:h-4 group-hover:border-[var(--accent-bright)] z-20" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[var(--accent)] transition-all duration-300 group-hover:w-4 group-hover:h-4 group-hover:border-[var(--accent-bright)] z-20" />

      {/* 3. Live Mouse XY Coordinate Telemetry */}
      {showTelemetry && isHovered && (
        <div className="absolute top-3 right-3 z-30 font-mono text-[9px] text-[var(--accent)] bg-[var(--surface-raised)]/90 px-2 py-0.5 rounded border border-[var(--border-accent)] tracking-wider">
          X:{coords.x} Y:{coords.y} // TEE
        </div>
      )}

      {/* 4. Scanning Grid & Scanline on Hover */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        style={{
          background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(45,212,191,0.08), transparent 70%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
};
