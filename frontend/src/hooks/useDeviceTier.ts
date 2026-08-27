import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** §5.1 / §9 — FPS probe + mobile particle budget */
export function useDeviceTier() {
  const reduced = useReducedMotion();
  const [mobile, setMobile] = useState(false);
  const [lowFps, setLowFps] = useState(false);
  const [probed, setProbed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);

    let frames = 0;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames += 1;
      if (now - start < 900) {
        raf = requestAnimationFrame(loop);
      } else {
        setLowFps(frames < 38);
        setProbed(true);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      mq.removeEventListener('change', apply);
      cancelAnimationFrame(raf);
    };
  }, []);

  const use3d = !reduced;

  return {
    reduced,
    mobile,
    lowFps,
    probed,
    use3d: true,
    particleCount: reduced ? 0 : mobile ? 200 : 500,
    bloom: !mobile,
    mouseRepel: !mobile,
  };
}
