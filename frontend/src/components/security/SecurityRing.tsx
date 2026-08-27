import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../ui';

interface SecurityRingProps {
  progress?: number; // 0 to 100
  status?: 'pending' | 'scanning' | 'verified' | 'threat';
  size?: number;
  strokeWidth?: number;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export const SecurityRing: React.FC<SecurityRingProps> = ({
  progress = 100,
  status = 'verified',
  size = 64,
  strokeWidth = 3,
  label,
  showIcon = true,
  className,
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const colorMap = {
    pending:  { stroke: 'var(--text-3)', bg: 'rgba(255,255,255,0.05)', text: 'var(--text-2)' },
    scanning: { stroke: 'var(--accent)', bg: 'var(--accent-muted)', text: 'var(--accent)' },
    verified: { stroke: 'var(--safe)', bg: 'rgba(34,197,94,0.12)', text: 'var(--safe)' },
    threat:   { stroke: 'var(--threat)', bg: 'rgba(239,68,68,0.12)', text: 'var(--threat)' },
  };

  const current = colorMap[status];

  return (
    <div className={cn('inline-flex flex-col items-center justify-center gap-1.5', className)}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--border)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Arc */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={current.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          {showIcon ? (
            status === 'verified' ? (
              <svg className="w-4 h-4 text-[var(--safe)]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : status === 'threat' ? (
              <svg className="w-4 h-4 text-[var(--threat)]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : status === 'scanning' ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full"
              />
            ) : (
              <span className="text-[10px] font-mono text-[var(--text-3)]">{progress}%</span>
            )
          ) : (
            <span className="text-xs font-bold font-mono" style={{ color: current.text }}>
              {progress}%
            </span>
          )}
        </div>
      </div>

      {label && <span className="text-[11px] font-mono text-[var(--text-2)]">{label}</span>}
    </div>
  );
};
