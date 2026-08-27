import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../ui';

interface ScanLineProps {
  active?: boolean;
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  speed?: number;
  className?: string;
}

export const ScanLine: React.FC<ScanLineProps> = ({
  active = true,
  orientation = 'horizontal',
  color = 'var(--accent)',
  speed = 2.4,
  className,
}) => {
  if (!active) return null;

  const isHorizontal = orientation === 'horizontal';

  return (
    <div className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)}>
      <motion.div
        animate={
          isHorizontal
            ? { top: ['-10%', '110%'], opacity: [0, 1, 1, 0] }
            : { left: ['-10%', '110%'], opacity: [0, 1, 1, 0] }
        }
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn(
          'absolute',
          isHorizontal ? 'w-full h-px left-0' : 'h-full w-px top-0'
        )}
        style={{
          background: isHorizontal
            ? `linear-gradient(90deg, transparent, ${color}, transparent)`
            : `linear-gradient(180deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 12px ${color}`,
        }}
      />
    </div>
  );
};
