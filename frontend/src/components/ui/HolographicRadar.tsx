import React from 'react';

interface HolographicRadarProps {
  size?: number;
  className?: string;
  blips?: { x: number; y: number; label: string; severity: 'critical' | 'high' | 'safe' }[];
}

export const HolographicRadar: React.FC<HolographicRadarProps> = ({
  size = 180,
  className = '',
  blips = [
    { x: 35, y: 40, label: 'Prompt Injection', severity: 'critical' },
    { x: 65, y: 70, label: 'PHI Expose', severity: 'high' },
    { x: 75, y: 30, label: 'Zero-Trust Node', severity: 'safe' },
  ],
}) => {
  return (
    <div
      className={`relative rounded-full border border-[var(--border-accent)]/40 bg-[var(--surface-raised)]/40 backdrop-blur-md overflow-hidden flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Concentric Range Rings */}
      <div className="absolute inset-2 rounded-full border border-[var(--accent)]/20" />
      <div className="absolute inset-8 rounded-full border border-[var(--accent)]/30" />
      <div className="absolute inset-14 rounded-full border border-[var(--accent)]/40" />

      {/* Axis Crosshairs */}
      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[var(--accent)]/20" />
      <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[var(--accent)]/20" />

      {/* Rotating Radar Sweep Cone */}
      <div
        className="absolute inset-0 rounded-full animate-radar-sweep pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(45,212,191,0.35) 360deg)',
        }}
      />

      {/* Blip Beacons */}
      {blips.map((b, idx) => {
        const color =
          b.severity === 'critical'
            ? 'bg-[#EF4444]'
            : b.severity === 'high'
            ? 'bg-[#F59E0B]'
            : 'bg-[#10B981]';
        return (
          <div
            key={idx}
            className="absolute flex items-center gap-1 group/blip cursor-pointer"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
            </span>
          </div>
        );
      })}

      {/* Center Radar Core */}
      <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-10" />
    </div>
  );
};
