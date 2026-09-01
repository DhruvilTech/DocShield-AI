import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface CyberTextScrambleProps {
  text: string;
  className?: string;
  scrambleSpeed?: number;
  triggerOnHover?: boolean;
  triggerInView?: boolean;
}

const GLYPHS = '01ABCDEF0x9F§µΔΨΩ#$!><[]{}/*~+=_';

export const CyberTextScramble: React.FC<CyberTextScrambleProps> = ({
  text,
  className = '',
  scrambleSpeed = 28,
  triggerOnHover = true,
  triggerInView = true,
}) => {
  const [displayText, setDisplayText] = useState(text);
  const isAnimating = useRef(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const scramble = useCallback(() => {
    if (reduced || isAnimating.current) return;
    isAnimating.current = true;

    let iteration = 0;
    const maxIterations = text.length;

    const interval = setInterval(() => {
      setDisplayText(() =>
        text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iteration) {
              return text[index];
            }
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join('')
      );

      if (iteration >= maxIterations) {
        clearInterval(interval);
        setDisplayText(text);
        isAnimating.current = false;
      }

      iteration += 1 / 2;
    }, scrambleSpeed);
  }, [text, scrambleSpeed, reduced]);

  useEffect(() => {
    if (!triggerInView || reduced) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          scramble();
        }
      },
      { threshold: 0.2 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [triggerInView, scramble, reduced]);

  return (
    <span
      ref={containerRef}
      onMouseEnter={triggerOnHover ? scramble : undefined}
      className={`font-mono transition-colors ${className}`}
    >
      {displayText}
    </span>
  );
};
