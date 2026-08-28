import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useMousePosition } from '../../hooks/useMousePosition';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/* ---- Document Mesh (the actual document being scanned) ---- */
const DocumentMesh: React.FC<{ scanning?: boolean }> = ({ scanning = false }) => {
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (ref.current && !scanning) {
      ref.current.rotation.y += dt * 0.1;
    }
  });
  return (
    <group ref={ref}>
      {/* Document body — Light Paper Sheet */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.6, 2.1, 0.04]} />
        <MeshTransmissionMaterial
          backside
          samples={4}
          thickness={0.05}
          roughness={0.1}
          transmission={0.82}
          ior={1.3}
          color="#BDE6F2"
          attenuationColor="#154B68"
          attenuationDistance={0.6}
        />
      </mesh>
      {/* Doc lines (text simulation) */}
      {[0.6, 0.3, 0, -0.3, -0.6, -0.85].map((y, i) => (
        <mesh key={i} position={[i % 2 === 0 ? -0.1 : 0.1, y, 0.025]}>
          <boxGeometry args={[i % 3 === 0 ? 0.9 : 1.1, 0.038, 0.001]} />
          <meshBasicMaterial color="#0A2B47" opacity={0.85} transparent />
        </mesh>
      ))}
      {/* Corner fold */}
      <mesh position={[0.7, 0.95, 0.025]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.2, 0.2, 0.001]} />
        <meshBasicMaterial color="#00F5D4" opacity={0.9} transparent />
      </mesh>
    </group>
  );
};

/* ---- Animated scan beam (horizontal line sweeping the document) ---- */
const ScanBeam: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const ref = useRef<THREE.Mesh>(null!);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt * (active ? 0.5 : 0);
    if (ref.current) {
      const y = Math.sin(t.current) * 1.05;
      ref.current.position.y = y;
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.7 + Math.sin(t.current * 4) * 0.15;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.05]}>
      <planeGeometry args={[2.0, 0.012]} />
      <meshBasicMaterial color="#00B8A9" opacity={0.8} transparent />
    </mesh>
  );
};

/* ---- Threat nodes (small orbs lighting up on detected threats) ---- */
const ThreatNode: React.FC<{ position: THREE.Vector3Tuple; severity?: 'critical' | 'high' | 'low' }> = ({
  position,
  severity = 'low',
}) => {
  const ref = useRef<THREE.PointLight>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);
  const color = severity === 'critical' ? '#EF4444' : severity === 'high' ? '#F97316' : '#F59E0B';

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.8 + Math.sin(t * 3 + position[0] * 5) * 0.2;
    if (meshRef.current) { (meshRef.current.material as THREE.MeshBasicMaterial).opacity = pulse; }
    if (ref.current) { ref.current.intensity = pulse * 0.8; }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <pointLight ref={ref} color={color} intensity={0.8} distance={1.2} />
    </group>
  );
};

/* ---- Security perimeter (ring that closes around secured doc) ---- */
const SecurityPerimeter: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.z = clock.getElapsedTime() * 0.3;
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = visible ? 0.4 + Math.sin(clock.getElapsedTime() * 1.5) * 0.1 : 0;
    }
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[1.6, 0.008, 8, 80]} />
      <meshBasicMaterial color="#00B8A9" transparent opacity={0.4} />
    </mesh>
  );
};

/* ---- Ambient particles ---- */
const Particles: React.FC = () => {
  const COUNT = 60;
  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 8;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
    }
    return arr;
  }, []);
  const ref = useRef<THREE.Points>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.015;
    }
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
      </bufferGeometry>
      <pointsMaterial size={0.018} color="#00B8A9" transparent opacity={0.35} sizeAttenuation />
    </points>
  );
};

/* ---- Camera rig responding to mouse ---- */
const CameraRig: React.FC = () => {
  const { nx, ny } = useMousePosition();
  useFrame(({ camera }) => {
    camera.position.x += (nx * 0.4 - camera.position.x) * 0.05;
    camera.position.y += (ny * 0.25 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  });
  return null;
};

/* ---- Scene Internals ---- */
const SceneContent: React.FC<{ scanning: boolean }> = ({ scanning }) => (
  <>
    <ambientLight intensity={0.2} />
    <directionalLight position={[4, 6, 4]} intensity={0.6} />
    <pointLight position={[-4, 2, 2]} intensity={0.4} color="#2563EB" />

    <Float speed={1.2} rotationIntensity={0.05} floatIntensity={0.3}>
      <DocumentMesh scanning={scanning} />
    </Float>

    <ScanBeam active={scanning} />

    {/* Threat nodes — animate in after "scan" */}
    {scanning && (
      <>
        <ThreatNode position={[-0.4, 0.6, 0.08]} severity="critical" />
        <ThreatNode position={[0.5, -0.3, 0.08]} severity="high" />
        <ThreatNode position={[0.1, -0.75, 0.08]} severity="low" />
      </>
    )}

    <SecurityPerimeter visible={!scanning} />
    <Particles />
    <CameraRig />
  </>
);

/* ---- CSS fallback for mobile/no-WebGL ---- */
const SceneFallback: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="relative w-40 h-52 sm:w-48 sm:h-60">
      {/* Document outline */}
      <div className="absolute inset-0 rounded-lg border border-[var(--border-accent)] bg-[var(--surface)]">
        <div className="absolute top-3 left-3 right-3 space-y-2">
          {[80, 60, 90, 55, 70].map((w, i) => (
            <div
              key={i}
              className="h-2 rounded-full bg-[var(--accent)] opacity-20"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </div>
      {/* Shield overlay */}
      <div className="absolute inset-0 flex items-end justify-end pb-3 pr-3">
        <div className="w-10 h-10 rounded-full bg-[var(--accent-muted)] border border-[var(--border-accent)] flex items-center justify-center">
          <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
      </div>
      {/* Scan ring */}
      <div className="absolute inset-0 rounded-lg border border-[var(--accent)] opacity-30 animate-pulse" />
    </div>
  </div>
);

/* ---- Main Export ---- */
interface SecuritySceneProps {
  scanning?: boolean;
  height?: string;
}

export const SecurityScene: React.FC<SecuritySceneProps> = ({ scanning = false, height = '480px' }) => {
  const reduced = useReducedMotion();

  if (reduced) return (
    <div style={{ height }} className="w-full"><SceneFallback /></div>
  );

  return (
    <div style={{ height }} className="w-full">
      <Suspense fallback={<SceneFallback />}>
        <Canvas
          camera={{ position: [0, 0, 4.5], fov: 38 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          dpr={[1, 1.5]}
          style={{ background: 'transparent' }}
        >
          <SceneContent scanning={scanning} />
        </Canvas>
      </Suspense>
    </div>
  );
};
