import React from 'react';
import { motion } from 'framer-motion';
import type { ThreatSeverity } from '../../types';
import { cn } from '../ui';

interface ThreatNodeProps {
  severity?: ThreatSeverity;
  label?: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ThreatNode: React.FC<ThreatNodeProps> = ({
  severity = 'medium',
  label,
  count,
  active = false,
  onClick,
  size = 'md',
  className,
}) => {
  const colors = {
    critical: { text: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', glow: '0 0 16px rgba(239, 68, 68, 0.35)' },
    high:     { text: '#F97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', glow: '0 0 14px rgba(249, 115, 22, 0.3)' },
    medium:   { text: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', glow: '0 0 12px rgba(245, 158, 11, 0.25)' },
    low:      { text: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', glow: '0 0 10px rgba(59, 130, 246, 0.2)' },
    info:     { text: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.4)', glow: '0 0 10px rgba(139, 92, 246, 0.2)' },
  };

  const current = colors[severity] || colors.medium;
  const pulseDuration = severity === 'critical' ? 1.2 : severity === 'high' ? 1.8 : 2.6;

  const sizeClasses = {
    sm: 'px-2 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-4 py-2.5 text-sm',
  };

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-lg border font-mono transition-all duration-200 cursor-pointer select-none',
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: current.bg,
        borderColor: active ? current.text : current.border,
        boxShadow: active ? current.glow : 'none',
      }}
    >
      {/* Animated Radar Beacon */}
      <span className="relative flex h-2 w-2">
        <motion.span
          animate={{ scale: [1, 2.2], opacity: [0.8, 0] }}
          transition={{ duration: pulseDuration, repeat: Infinity, ease: 'easeOut' }}
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ backgroundColor: current.text }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ backgroundColor: current.text }}
        />
      </span>

      {label && <span className="text-[var(--text-1)] font-medium">{label}</span>}
      {count !== undefined && (
        <span
          className="font-bold text-[10px] px-1.5 py-0.2 rounded"
          style={{ backgroundColor: current.text, color: '#0D1117' }}
        >
          {count}
        </span>
      )}
    </motion.div>
  );
};
