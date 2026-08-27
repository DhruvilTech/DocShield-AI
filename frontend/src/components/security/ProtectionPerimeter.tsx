import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../ui';

interface ProtectionPerimeterProps {
  active?: boolean;
  state?: 'secure' | 'scanning' | 'alert';
  children: React.ReactNode;
  className?: string;
}

export const ProtectionPerimeter: React.FC<ProtectionPerimeterProps> = ({
  active = true,
  state = 'secure',
  children,
  className,
}) => {
  const stateColor =
    state === 'secure' ? 'var(--accent)' : state === 'alert' ? 'var(--threat)' : 'var(--warning)';

  return (
    <div className={cn('relative group', className)}>
      {active && (
        <>
          {/* Corner brackets */}
          <div
            className="absolute -top-1.5 -left-1.5 w-3 h-3 border-t-2 border-l-2 rounded-tl pointer-events-none transition-colors duration-300"
            style={{ borderColor: stateColor }}
          />
          <div
            className="absolute -top-1.5 -right-1.5 w-3 h-3 border-t-2 border-r-2 rounded-tr pointer-events-none transition-colors duration-300"
            style={{ borderColor: stateColor }}
          />
          <div
            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 border-b-2 border-l-2 rounded-bl pointer-events-none transition-colors duration-300"
            style={{ borderColor: stateColor }}
          />
          <div
            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 border-b-2 border-r-2 rounded-br pointer-events-none transition-colors duration-300"
            style={{ borderColor: stateColor }}
          />

          {/* Ambient perimeter breathing glow */}
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-xl pointer-events-none -z-10"
            style={{
              boxShadow: `0 0 20px ${stateColor}22, inset 0 0 20px ${stateColor}08`,
            }}
          />
        </>
      )}
      {children}
    </div>
  );
};
