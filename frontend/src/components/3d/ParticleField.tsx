import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneVariant } from '../../lib/scene';

/** Cheap 2D value noise — Perlin-like drift without a heavy sim (§5.1) */
function n2(x: number, y: number) {
  return Math.sin(x * 1.31 + y * 0.73) * 0.55 + Math.sin(x * 0.47 - y * 1.17) * 0.45;
}

function targetFor(
  i: number,
  count: number,
  variant: SceneVariant,
  seed: number
): THREE.Vector3 {
  const t = i / count;
  const a = t * Math.PI * 2 * 7.13 + seed;
  const b = t * Math.PI * 4.27 + seed * 0.3;

  switch (variant) {
    case 'scanner': {
      const x = (t - 0.5) * 14;
      const z = n2(i * 0.2, seed) * 3.2;
      const y = ((i % 18) / 18 - 0.5) * 8;
      return new THREE.Vector3(x, y, z);
    }
    case 'analysis':
    case 'reports': {
      const clusters = 6;
      const c = i % clusters;
      const ang = (c / clusters) * Math.PI * 2;
      const cx = Math.cos(ang) * 3.4;
      const cy = Math.sin(ang) * 2.2;
      const cz = ((c % 3) - 1) * 1.4;
      return new THREE.Vector3(
        cx + n2(i, seed) * 1.1,
        cy + n2(seed, i) * 1.1,
        cz + n2(i * 0.3, seed * 2) * 0.8
      );
    }
    case 'security': {
      const ring = a;
      const r = 3.2 + (i % 5) * 0.28;
      return new THREE.Vector3(Math.cos(ring) * r, Math.sin(ring * 0.5) * 0.35, Math.sin(ring) * r);
    }
    case 'enterprise':
    case 'vault': {
      const cols = 28;
      const col = i % cols;
      const row = Math.floor(i / cols);
      return new THREE.Vector3((col - cols / 2) * 0.42, -2.2 + (i % 3) * 0.04, (row % 22) * 0.42 - 4);
    }
    case 'threats': {
      const r = 1.2 + t * 5.5;
      return new THREE.Vector3(Math.cos(a) * r, n2(i, seed) * 2.4, Math.sin(a) * r);
    }
    default: {
      const phi = Math.acos(1 - 2 * ((i + 0.5) / count));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 4.2;
      return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
  }
}

interface ParticleFieldProps {
  count: number;
  variant: SceneVariant;
  mouseRepel: boolean;
  clusterIndex: number;
  lightTheme: boolean;
}

/** §5.1 shared particle/network field — morphs with route, never remounts Canvas */
export const ParticleField: React.FC<ParticleFieldProps> = ({
  count,
  variant,
  mouseRepel,
  clusterIndex,
  lightTheme,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const { pointer } = useThree();
  const seeds = useMemo(() => Float32Array.from({ length: count }, (_, i) => i * 0.173), [count]);

  const { positions, colors, lineIndex } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const teal = new THREE.Color(lightTheme ? '#0D9488' : '#2DD4BF');
    const violet = new THREE.Color('#7C5CFC');
    const blue = new THREE.Color('#3B82F6');
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const p = targetFor(i, count, 'intelligence', seeds[i]);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      tmp.copy(teal).lerp(i % 5 === 0 ? violet : blue, i % 7 === 0 ? 0.55 : 0.12);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    /* Sparse connections — not a physics sim (§5.1) */
    const maxLines = Math.min(900, Math.floor(count * 1.1));
    const lineIndex: number[] = [];
    const stride = Math.max(1, Math.floor(count / 180));
    for (let i = 0; i < count && lineIndex.length / 2 < maxLines; i += stride) {
      const j = (i + 11 + (i % 17)) % count;
      const k = (i + 29) % count;
      lineIndex.push(i, j, i, k);
    }

    return { positions, colors, lineIndex: new Uint16Array(lineIndex) };
  }, [count, seeds, lightTheme]);

  const linePositions = useMemo(() => new Float32Array(lineIndex.length * 3), [lineIndex.length]);

  const current = useRef(positions.slice());
  const teal = useMemo(() => new THREE.Color(lightTheme ? '#0D9488' : '#2DD4BF'), [lightTheme]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = current.current;
    const mx = mouseRepel ? pointer.x * 6 : 0;
    const my = mouseRepel ? pointer.y * 4 : 0;

    for (let i = 0; i < count; i++) {
      const target = targetFor(i, count, variant, seeds[i]);
      const drift = n2(t * 0.12 + seeds[i], i * 0.01);
      target.x += drift * 0.35;
      target.y += n2(i * 0.02, t * 0.1) * 0.28;

      if (mouseRepel) {
        const dx = pos[i * 3] - mx;
        const dy = pos[i * 3 + 1] - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < 6.25 && d2 > 0.0001) {
          const f = (2.5 - Math.sqrt(d2)) * 0.08;
          target.x += (dx / Math.sqrt(d2)) * f;
          target.y += (dy / Math.sqrt(d2)) * f;
        }
      }

      /* §5.2 Analysis — highlight cluster region */
      if ((variant === 'analysis' || variant === 'reports') && clusterIndex >= 0) {
        if (i % 6 === clusterIndex) {
          target.multiplyScalar(1.08);
        }
      }

      pos[i * 3] += (target.x - pos[i * 3]) * 0.035;
      pos[i * 3 + 1] += (target.y - pos[i * 3 + 1]) * 0.035;
      pos[i * 3 + 2] += (target.z - pos[i * 3 + 2]) * 0.035;
    }

    const geo = pointsRef.current?.geometry;
    const attr = geo?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (attr) {
      (attr.array as Float32Array).set(pos);
      attr.needsUpdate = true;
    }

    for (let l = 0; l < lineIndex.length; l++) {
      const pi = lineIndex[l];
      linePositions[l * 3] = pos[pi * 3];
      linePositions[l * 3 + 1] = pos[pi * 3 + 1];
      linePositions[l * 3 + 2] = pos[pi * 3 + 2];
    }
    const lineAttr = linesRef.current?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (lineAttr) {
      (lineAttr.array as Float32Array).set(linePositions);
      lineAttr.needsUpdate = true;
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.012;
    }
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={lightTheme ? 0.038 : 0.032}
          vertexColors
          transparent
          opacity={lightTheme ? 0.55 : 0.72}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={teal}
          transparent
          opacity={lightTheme ? 0.12 : 0.16}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
};
