import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../ui';

interface VerificationAnimationProps {
  verified?: boolean;
  score?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const VerificationAnimation: React.FC<VerificationAnimationProps> = ({
  verified = true,
  score = 99.9,
  label = 'Cryptographically Verified',
  size = 'md',
  className,
}) => {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'inline-flex items-center gap-3 p-3 rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 shadow-[0_0_20px_rgba(34,197,94,0.15)]',
        className
      )}
    >
      <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-[#22C55E]/20 text-[#22C55E]">
        {/* Animated Ring */}
        <motion.div
          animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full border border-[#22C55E]"
        />
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>

      <div>
        <div className="text-xs font-bold text-[var(--text-1)] flex items-center gap-1.5">
          <span>{label}</span>
          <span className="text-[10px] font-mono text-[#22C55E] px-1 py-0.2 rounded bg-[#22C55E]/20">
            {score}% Trust
          </span>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-2)]">Merkle Proof: 0x9f4a...8c21 (Immutable)</div>
      </div>
    </motion.div>
  );
};
