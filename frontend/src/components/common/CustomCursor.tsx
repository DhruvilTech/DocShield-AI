import React, { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export const CustomCursor: React.FC = () => {
  const reducedMotion = useReducedMotion();
  const [cursorType, setCursorType] = useState<'default' | 'interactive' | 'threat' | 'scan'>('default');
  const [isPointerDevice, setIsPointerDevice] = useState(false);
  const x = useSpring(-100, { stiffness: 500, damping: 40 });
  const y = useSpring(-100, { stiffness: 500, damping: 40 });
  const ringX = useSpring(-100, { stiffness: 180, damping: 22 });
  const ringY = useSpring(-100, { stiffness: 180, damping: 22 });

  useEffect(() => {
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    setIsPointerDevice(hasFinePointer);
    if (!hasFinePointer || reducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      ringX.set(e.clientX);
      ringY.set(e.clientY);

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('[data-cursor="threat"]')) {
        setCursorType('threat');
      } else if (target.closest('[data-cursor="scan"]')) {
        setCursorType('scan');
      } else if (
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('.card-interactive') ||
        target.closest('.card-magnetic')
      ) {
        setCursorType('interactive');
      } else {
        setCursorType('default');
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [reducedMotion, x, y, ringX, ringY]);

  if (!isPointerDevice || reducedMotion) return null;

  const color =
    cursorType === 'threat' ? '#FB4A4A' : cursorType === 'scan' ? '#7C5CFC' : '#2DD4BF';
  const interactive = cursorType === 'interactive' || cursorType === 'threat';

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden="true">
      <motion.div
        className="fixed rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{
          left: ringX,
          top: ringY,
          border: `1px solid ${interactive ? '#05070A' : color}`,
          backgroundColor: interactive ? color : 'transparent',
          mixBlendMode: interactive ? 'screen' : 'normal',
          boxShadow: `0 0 10px ${color}33`,
        }}
        animate={{
          width: interactive ? 42 : 26,
          height: interactive ? 42 : 26,
        }}
        transition={{ type: 'spring', stiffness: 450, damping: 28 }}
      />
      <motion.div
        className="fixed w-1.5 h-1.5 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{ left: x, top: y, backgroundColor: color }}
      />
    </div>
  );
};


