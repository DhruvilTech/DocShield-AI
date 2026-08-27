import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneVariant } from '../../lib/scene';

interface MotifsProps {
  variant: SceneVariant;
  scanning: boolean;
  scrollY: number;
  reduced: boolean;
}

function useOpacity(active: boolean, reduced: boolean) {
  const ref = useRef(active ? 1 : 0);
  useFrame((_, dt) => {
    const target = active ? 1 : 0;
    ref.current += (target - ref.current) * Math.min(1, dt * 3.2);
  });
  return ref;
}

/** §5.2 Home / Intelligence — wireframe icosahedron + glowing core */
const ShieldMotif: React.FC<{ active: boolean; reduced: boolean; scrollY: number }> = ({
  active,
  reduced,
  scrollY,
}) => {
  const group = useRef<THREE.Group>(null);
  const opacity = useOpacity(active, reduced);
  useFrame((_, dt) => {
    if (!group.current) return;
    if (!reduced) group.current.rotation.y += dt * 0.18;
    const s = 0.15 + opacity.current * 0.85;
    group.current.scale.setScalar(s);
    group.current.visible = opacity.current > 0.02;
    group.current.position.z = THREE.MathUtils.lerp(0, -1.2, Math.min(scrollY / 900, 1));
  });
  return (
    <group ref={group} position={[3.2, 0.4, -1.5]}>
      <mesh>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial color="#2DD4BF" wireframe transparent opacity={0.45} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshBasicMaterial color="#5EEAD4" transparent opacity={0.85} />
      </mesh>
      <pointLight color="#2DD4BF" intensity={1.4} distance={6} />
    </group>
  );
};

/** §5.2 Scanner — horizontal scan plane looping ~4s */
const ScanMotif: React.FC<{ active: boolean; scanning: boolean; reduced: boolean }> = ({
  active,
  scanning,
  reduced,
}) => {
  const mesh = useRef<THREE.Mesh>(null);
  const opacity = useOpacity(active, reduced);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const cycle = (clock.getElapsedTime() % 4) / 4;
    mesh.current.position.y = 3.2 - cycle * 6.4;
    const mat = mesh.current.material as THREE.MeshBasicMaterial;
    const flash = scanning ? 0.85 : 0.35;
    mat.opacity = opacity.current * flash;
    mat.color.set(scanning ? '#F5F7FA' : '#2DD4BF');
    mesh.current.visible = opacity.current > 0.02;
  });
  return (
    <mesh ref={mesh} rotation={[-0.12, 0, 0]}>
      <planeGeometry args={[16, 0.06]} />
      <meshBasicMaterial color="#2DD4BF" transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
};

/** §5.2 Analysis — pulsing graph nodes */
const GraphMotif: React.FC<{ active: boolean; clusterIndex: number; reduced: boolean }> = ({
  active,
  clusterIndex,
  reduced,
}) => {
  const group = useRef<THREE.Group>(null);
  const opacity = useOpacity(active, reduced);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.visible = opacity.current > 0.02;
    group.current.children.forEach((child, i) => {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 1.6 + i) * 0.08;
      const highlight = clusterIndex === i ? 1.25 : 1;
      child.scale.setScalar(pulse * highlight * (0.2 + opacity.current));
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: 6 }).map((_, i) => {
        const ang = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(ang) * 3.4, Math.sin(ang) * 2.1, 0]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color={i % 2 ? '#7C5CFC' : '#3B82F6'} transparent opacity={0.7} />
          </mesh>
        );
      })}
    </group>
  );
};

/** §5.2 Security — perimeter ring + pulse ping */
const PerimeterMotif: React.FC<{ active: boolean; scrollY: number; reduced: boolean }> = ({
  active,
  scrollY,
  reduced,
}) => {
  const ring = useRef<THREE.Group>(null);
  const ping = useRef<THREE.Mesh>(null);
  const opacity = useOpacity(active, reduced);
  useFrame(({ clock }, dt) => {
    if (ring.current) {
      if (!reduced) ring.current.rotation.y -= dt * 0.22 + scrollY * 0.00002;
      ring.current.visible = opacity.current > 0.02;
    }
    if (ping.current) {
      const p = (clock.getElapsedTime() % 3.8) / 3.8;
      ping.current.scale.setScalar(1 + p * 3.2);
      (ping.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.35 * opacity.current;
    }
  });
  return (
    <group>
      <group ref={ring}>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.6, 0.02, 8, 96]} />
        <meshBasicMaterial color="#2DD4BF" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0, 0.4]}>
        <torusGeometry args={[2.15, 0.012, 8, 64]} />
        <meshBasicMaterial color="#7C5CFC" transparent opacity={0.3} />
      </mesh>
      </group>
      <mesh ref={ping} rotation={[Math.PI / 2.4, 0, 0]}>
        <ringGeometry args={[2.5, 2.58, 64]} />
        <meshBasicMaterial color="#2DD4BF" transparent depthWrite={false} />
      </mesh>
    </group>
  );
};

/** §5.2 Enterprise — structured grid + light beams */
const GridMotif: React.FC<{ active: boolean; reduced: boolean }> = ({ active, reduced }) => {
  const group = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const opacity = useOpacity(active, reduced);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.visible = opacity.current > 0.02;
    if (beam.current && !reduced) {
      beam.current.position.x = Math.sin(clock.getElapsedTime() * 0.25) * 4;
    }
  });
  return (
    <group ref={group} position={[0, -2.4, 0]} rotation={[-Math.PI / 2.6, 0, 0]}>
      <gridHelper args={[18, 28, '#2DD4BF', '#1a3030']} />
      <mesh ref={beam} position={[0, 0, 0.2]}>
        <planeGeometry args={[0.18, 14]} />
        <meshBasicMaterial color="#3B82F6" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
};

export const SceneMotifs: React.FC<MotifsProps & { clusterIndex: number }> = ({
  variant,
  scanning,
  scrollY,
  reduced,
  clusterIndex,
}) => (
  <>
    <ShieldMotif
      active={variant === 'intelligence'}
      reduced={reduced}
      scrollY={scrollY}
    />
    <ScanMotif active={variant === 'scanner'} scanning={scanning} reduced={reduced} />
    <GraphMotif
      active={variant === 'analysis' || variant === 'reports'}
      clusterIndex={clusterIndex}
      reduced={reduced}
    />
    <PerimeterMotif
      active={variant === 'security' || variant === 'threats'}
      scrollY={scrollY}
      reduced={reduced}
    />
    <GridMotif active={variant === 'enterprise' || variant === 'vault'} reduced={reduced} />
  </>
);
