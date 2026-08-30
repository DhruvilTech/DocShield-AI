import React, { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export const CustomCursor: React.FC = () => {
  const reducedMotion = useReducedMotion();
  const [cursorType, setCursorType] = useState<'default' | 'interactive' | 'threat' | 'scan'>('default');
  const [isPointerDevice, setIsPointerDevice] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const x = useSpring(-100, { stiffness: 600, damping: 45 });
  const y = useSpring(-100, { stiffness: 600, damping: 45 });
  const ringX = useSpring(-100, { stiffness: 220, damping: 24 });
  const ringY = useSpring(-100, { stiffness: 220, damping: 24 });

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
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea') ||
        target.closest('[role="button"]') ||
        target.closest('.card-interactive') ||
        target.closest('.card-magnetic') ||
        target.closest('.cursor-pointer')
      ) {
        setCursorType('interactive');
      } else {
        setCursorType('default');
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('mouseup', handleMouseUp, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [reducedMotion, x, y, ringX, ringY]);

  if (!isPointerDevice || reducedMotion) return null;

  const color =
    cursorType === 'threat' ? '#FB4A4A' : cursorType === 'scan' ? '#7C5CFC' : '#2DD4BF';
  const interactive = cursorType === 'interactive' || cursorType === 'threat' || cursorType === 'scan';

  return (
    <div className="pointer-events-none fixed inset-0 z-[99999] overflow-hidden" aria-hidden="true">
      {/* Outer Targeting Ring - Translucent with glowing outline to never block underlying text */}
      <motion.div
        className="fixed rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{
          left: ringX,
          top: ringY,
          border: `1.5px solid ${color}`,
          backgroundColor: interactive ? `${color}18` : `${color}08`,
          boxShadow: `0 0 12px ${color}33, inset 0 0 8px ${color}15`,
        }}
        animate={{
          width: isClicking ? 28 : interactive ? 38 : 24,
          height: isClicking ? 28 : interactive ? 38 : 24,
          opacity: 1,
        }}
        transition={{ type: 'spring', stiffness: 450, damping: 28 }}
      />
      {/* Inner Precision Reticle Dot */}
      <motion.div
        className="fixed rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{ left: x, top: y, backgroundColor: color }}
        animate={{
          width: interactive ? 4 : 5,
          height: interactive ? 4 : 5,
          opacity: isClicking ? 0.6 : 0.9,
        }}
        transition={{ duration: 0.15 }}
      />
    </div>
  );
};
