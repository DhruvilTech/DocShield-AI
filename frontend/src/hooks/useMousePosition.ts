import { useState, useEffect } from 'react';

export interface MousePos {
  x: number; y: number;
  nx: number; ny: number; // normalized -1 to 1
}

export function useMousePosition(): MousePos {
  const [pos, setPos] = useState<MousePos>({ x: 0, y: 0, nx: 0, ny: 0 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const { innerWidth: w, innerHeight: h } = window;
      setPos({
        x: e.clientX, y: e.clientY,
        nx: (e.clientX / w) * 2 - 1,
        ny: -((e.clientY / h) * 2 - 1),
      });
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return pos;
}
