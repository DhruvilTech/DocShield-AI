import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface DocInstanceData {
  id: number;
  initialPos: THREE.Vector3;
  initialRot: THREE.Euler;
  scale: number;
  speed: number;
  rotSpeed: THREE.Vector3;
  type: 'pdf' | 'folder' | 'code' | 'verified';
  accentColor: string;
  glowColor: string;
  linesCount: number;
}

/** Individual 3D Floating Cyber Document */
const FloatingDocumentMesh: React.FC<{
  data: DocInstanceData;
  scrollY: number;
  lightTheme: boolean;
  mouseRepel: boolean;
}> = ({ data, scrollY, lightTheme, mouseRepel }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const scanBeamRef = useRef<THREE.Mesh>(null!);
  const { pointer } = useThree();
  const reduced = useReducedMotion();

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime() * data.speed;

    if (!reduced) {
      // 3D floating translation drift
      const floatY = Math.sin(t + data.id * 1.5) * 0.35;
      const floatX = Math.cos(t * 0.8 + data.id * 1.2) * 0.25;
      const floatZ = Math.sin(t * 0.6 + data.id) * 0.2;

      // Parallax with page scroll (layers move at different depths)
      const depthFactor = data.initialPos.z > 0 ? 1.6 : data.initialPos.z > -2 ? 1.0 : 0.5;
      const scrollOffset = -(scrollY * 0.0028 * depthFactor);

      let targetX = data.initialPos.x + floatX;
      let targetY = data.initialPos.y + floatY + scrollOffset;
      let targetZ = data.initialPos.z + floatZ;

      // Mouse repulsion in 3D
      if (mouseRepel) {
        const mx = pointer.x * 6;
        const my = pointer.y * 4;
        const dx = groupRef.current.position.x - mx;
        const dy = groupRef.current.position.y - my;
        const distSq = dx * dx + dy * dy;

        if (distSq < 5.5 && distSq > 0.001) {
          const push = (2.35 - Math.sqrt(distSq)) * 0.2;
          targetX += (dx / Math.sqrt(distSq)) * push;
          targetY += (dy / Math.sqrt(distSq)) * push;
        }
      }

      // Smooth interpolation
      groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.05;
      groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.05;
      groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.05;

      // Continuous 3D rotation
      groupRef.current.rotation.x = data.initialRot.x + Math.sin(t * data.rotSpeed.x) * 0.4;
      groupRef.current.rotation.y = data.initialRot.y + t * data.rotSpeed.y;
      groupRef.current.rotation.z = data.initialRot.z + Math.cos(t * data.rotSpeed.z) * 0.3;

      // Periodic subtle laser scanline sweeping across this document
      if (scanBeamRef.current) {
        const scanCycle = (clock.getElapsedTime() * 0.9 + data.id * 0.7) % 4.0;
        if (scanCycle < 1.0) {
          scanBeamRef.current.visible = true;
          scanBeamRef.current.position.y = 0.55 - (scanCycle / 1.0) * 1.1;
          (scanBeamRef.current.material as THREE.MeshBasicMaterial).opacity =
            Math.sin((scanCycle / 1.0) * Math.PI) * 0.8;
        } else {
          scanBeamRef.current.visible = false;
        }
      }
    }
  });

  const width = data.type === 'folder' ? 1.25 : 0.95;
  const height = data.type === 'folder' ? 0.9 : 1.3;

  return (
    <group ref={groupRef} position={data.initialPos} rotation={data.initialRot} scale={data.scale}>
      {/* 3D Glassmorphic Document Base Plate */}
      <mesh>
        <boxGeometry args={[width, height, 0.03]} />
        <meshStandardMaterial
          color={lightTheme ? '#FFFFFF' : '#071018'}
          roughness={0.1}
          metalness={0.4}
          transparent
          opacity={lightTheme ? 0.6 : 0.85}
        />
      </mesh>

      {/* Glowing Outer Cyber Wireframe Border */}
      <mesh>
        <boxGeometry args={[width + 0.025, height + 0.025, 0.035]} />
        <meshBasicMaterial
          color={data.accentColor}
          wireframe
          transparent
          opacity={lightTheme ? 0.5 : 0.8}
        />
      </mesh>

      {/* Document Header Bar */}
      <mesh position={[0, height * 0.38, 0.02]}>
        <planeGeometry args={[width * 0.82, height * 0.12]} />
        <meshBasicMaterial color={data.accentColor} transparent opacity={0.7} />
      </mesh>

      {/* Small Header Tag */}
      <mesh position={[-width * 0.22, height * 0.38, 0.025]}>
        <planeGeometry args={[width * 0.3, height * 0.05]} />
        <meshBasicMaterial color={data.glowColor} transparent opacity={0.9} />
      </mesh>

      {/* Document Lines (Simulated Paragraphs / Security AST) */}
      {Array.from({ length: data.linesCount }).map((_, i) => {
        const yPos = height * 0.22 - i * (height * 0.12);
        const lineWidth = (i % 4 === 0 ? 0.82 : i % 3 === 0 ? 0.65 : i % 2 === 0 ? 0.75 : 0.55) * width * 0.85;
        const xOffset = i % 2 === 0 ? -width * 0.04 : width * 0.04;
        const isHighlight = i === 1 || i === 4;

        return (
          <mesh key={i} position={[xOffset, yPos, 0.02]}>
            <planeGeometry args={[lineWidth, height * 0.04]} />
            <meshBasicMaterial
              color={isHighlight ? data.glowColor : data.accentColor}
              transparent
              opacity={isHighlight ? 0.8 : 0.45}
            />
          </mesh>
        );
      })}

      {/* Folded Corner Detail for Sheets */}
      {data.type !== 'folder' && (
        <mesh position={[width * 0.42, height * 0.42, 0.022]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[0.18, 0.18]} />
          <meshBasicMaterial color={data.glowColor} transparent opacity={0.9} />
        </mesh>
      )}

      {/* Holographic Watermark Badge on Verified Documents */}
      {data.type === 'verified' && (
        <group position={[width * 0.25, -height * 0.32, 0.022]}>
          <mesh>
            <circleGeometry args={[0.12, 20]} />
            <meshBasicMaterial color="#34D399" transparent opacity={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <ringGeometry args={[0.13, 0.15, 20]} />
            <meshBasicMaterial color="#5EEAD4" transparent opacity={0.95} />
          </mesh>
        </group>
      )}

      {/* Cyber Folder Tab & Lock Icon for Folders */}
      {data.type === 'folder' && (
        <mesh position={[-width * 0.28, height * 0.52, 0.015]}>
          <boxGeometry args={[width * 0.4, height * 0.14, 0.025]} />
          <meshBasicMaterial color={data.accentColor} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Sweeping Laser Beam across the document */}
      <mesh ref={scanBeamRef} position={[0, 0, 0.025]} visible={false}>
        <planeGeometry args={[width * 0.95, 0.03]} />
        <meshBasicMaterial color={data.glowColor} transparent opacity={0.95} />
      </mesh>
    </group>
  );
};

interface FloatingDocumentsFieldProps {
  count?: number;
  scrollY?: number;
  lightTheme?: boolean;
  mouseRepel?: boolean;
}

export const FloatingDocumentsField: React.FC<FloatingDocumentsFieldProps> = ({
  count = 38,
  scrollY = 0,
  lightTheme = false,
  mouseRepel = true,
}) => {
  // Generate 3D document layout spread cleanly across the entire camera field of view
  const documents = useMemo<DocInstanceData[]>(() => {
    const docs: DocInstanceData[] = [];
    const types: ('pdf' | 'folder' | 'code' | 'verified')[] = ['pdf', 'folder', 'code', 'verified'];
    const palette = [
      { accent: '#2DD4BF', glow: '#5EEAD4' }, // Teal / Cyan
      { accent: '#7C5CFC', glow: '#A78BFA' }, // Violet AI
      { accent: '#3B82F6', glow: '#93C5FD' }, // Blue Data
      { accent: '#34D399', glow: '#6EE7B7' }, // Emerald Safe
      { accent: '#F5A623', glow: '#FCD34D' }, // Amber Warning
    ];

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2 * ((i + 0.5) / count));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      // Distribute in foreground (z: 0.5 to 1.8), midground (z: -1.5 to -3), and deep background (z: -4 to -7)
      const radius = 3.6 + (i % 4) * 1.8;
      const x = Math.sin(phi) * Math.cos(theta) * radius * 1.8;
      const y = Math.sin(phi) * Math.sin(theta) * radius * 1.1 + ((i % 5) - 2) * 1.5;
      const z = Math.cos(phi) * radius * 0.8 - ((i % 4) * 1.6);

      const rotX = (Math.random() - 0.5) * 1.4;
      const rotY = (Math.random() - 0.5) * 2.2;
      const rotZ = (Math.random() - 0.5) * 1.2;

      const col = palette[i % palette.length];

      docs.push({
        id: i,
        initialPos: new THREE.Vector3(x, y, z),
        initialRot: new THREE.Euler(rotX, rotY, rotZ),
        scale: 0.9 + (i % 3) * 0.35,
        speed: 0.45 + (i % 4) * 0.18,
        rotSpeed: new THREE.Vector3(
          0.12 + (i % 3) * 0.08,
          0.08 + (i % 5) * 0.06,
          0.1 + (i % 2) * 0.06
        ),
        type: types[i % types.length],
        accentColor: col.accent,
        glowColor: col.glow,
        linesCount: 5 + (i % 3),
      });
    }

    return docs;
  }, [count]);

  return (
    <group>
      {documents.map((doc) => (
        <FloatingDocumentMesh
          key={doc.id}
          data={doc}
          scrollY={scrollY}
          lightTheme={lightTheme}
          mouseRepel={mouseRepel}
        />
      ))}
    </group>
  );
};

export default FloatingDocumentsField;
