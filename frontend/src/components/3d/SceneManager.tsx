import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useScene } from '../../context/SceneContext';
import { useDeviceTier } from '../../hooks/useDeviceTier';
import { FloatingDocumentsField } from './FloatingDocumentsField';
import type { Theme } from '../../types';

/** §5.1 camera — GSAP-equivalent dolly via scroll, no remount */
const CameraRig: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const { camera } = useThree();
  const { variant, scrollY } = useScene();
  const z = useRef(6.2);

  useFrame(() => {
    let target = 6.2;
    if (variant === 'intelligence') target = 6.2 - Math.min(scrollY / 1400, 0.85);
    if (variant === 'scanner') target = 7.0;
    if (variant === 'enterprise' || variant === 'vault') target = 7.4;
    if (variant === 'security') target = 6.6;
    z.current += (target - z.current) * 0.04;
    camera.position.z = z.current;
    if (!reduced) {
      camera.position.y += ((variant === 'enterprise' ? 1.6 : 0.2) - camera.position.y) * 0.04;
    }
    camera.lookAt(0, 0, 0);
  });
  return null;
};

const SceneInner: React.FC<{ theme: Theme }> = ({ theme }) => {
  const { scrollY } = useScene();
  const tier = useDeviceTier();
  const light = theme === 'light';

  return (
    <>
      <color attach="background" args={[light ? '#e8eef2' : '#05070A']} />
      <fog attach="fog" args={[light ? '#e8eef2' : '#05070A', 6, 22]} />
      <ambientLight intensity={light ? 0.6 : 0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.7} color="#ffffff" />
      <pointLight position={[-5, 3, 3]} intensity={0.7} color="#7C5CFC" />
      <pointLight position={[5, -3, 2]} intensity={0.6} color="#2DD4BF" />

      {/* Floating 3D Documents Background Field across all pages */}
      <FloatingDocumentsField
        count={6}
        scrollY={scrollY}
        lightTheme={light}
        mouseRepel={tier.mouseRepel}
      />


      <CameraRig reduced={tier.reduced} />
      {tier.bloom && (
        <EffectComposer enableNormalPass={false}>
          {/* §5.1 bloom/vignette tuned for high-tech glow & WCAG text contrast */}
          <Bloom intensity={light ? 0.25 : 0.5} luminanceThreshold={0.3} mipmapBlur />
          <Vignette offset={0.3} darkness={light ? 0.2 : 0.6} />
        </EffectComposer>
      )}
    </>
  );
};

/** §5.1 / §9 — single root Canvas, lazy-loaded, pointer-events none */
export const SceneManager: React.FC<{ theme: Theme }> = ({ theme }) => {
  const { setScrollY } = useScene();
  const tier = useDeviceTier();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [setScrollY]);

  if (!tier.use3d) {
    return (
      <div
        className="fixed inset-0 -z-0 pointer-events-none tech-grid"
        style={{ opacity: theme === 'light' ? 0.35 : 0.22 }}
        aria-hidden
      />
    );
  }

  return (
    <div
      ref={wrap}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0.2, 6.2], fov: 42, near: 0.1, far: 40 }}
        dpr={[1, 1.75]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <SceneInner theme={theme} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default SceneManager;
