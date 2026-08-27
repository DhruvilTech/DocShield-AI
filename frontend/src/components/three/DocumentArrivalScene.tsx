import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { useMousePosition } from '../../hooks/useMousePosition';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type AnimationPhase = 'arrival' | 'extracting' | 'scanning' | 'secured';

export interface ThreatItem {
  id: string;
  type: string;
  location: string;
  severity: 'critical' | 'high' | 'medium';
  pos: [number, number, number];
  remediatedText?: string;
}

export interface DocumentInfo {
  id: string;
  title: string;
  type: 'pdf' | 'docx' | 'code' | 'audit';
  size: string;
  hash: string;
  threats: ThreatItem[];
}

export const SAMPLE_DOCUMENTS: Record<string, DocumentInfo> = {
  'prompt-injection': {
    id: 'prompt-injection',
    title: 'Adversarial_NDA_Payload.pdf',
    type: 'pdf',
    size: '2.4 MB',
    hash: '0x8F92...B41E',
    threats: [
      {
        id: 't1',
        type: 'Prompt Injection (System Override)',
        location: 'Page 1, Paragraph 2 · Byte 0x0140',
        severity: 'critical',
        pos: [-0.35, 0.55, 0.03],
        remediatedText: '[SYSTEM_PROMPT_ISOLATED]',
      },
      {
        id: 't2',
        type: 'Zero-Width Unicode Escape',
        location: 'Page 1, Signature Block',
        severity: 'high',
        pos: [0.3, 0.05, 0.03],
        remediatedText: '[SANITIZED_UTF8_CANONICAL]',
      },
      {
        id: 't3',
        type: 'Exfiltration Webhook URL',
        location: 'Embedded Hyperlink · Port 8443',
        severity: 'critical',
        pos: [-0.2, -0.5, 0.03],
        remediatedText: '[BLOCKED_ENDPOINT_NULL]',
      },
    ],
  },
  'patient-phi': {
    id: 'patient-phi',
    title: 'Genomics_Patient_Report.docx',
    type: 'docx',
    size: '1.8 MB',
    hash: '0x3C4A...7F91',
    threats: [
      {
        id: 't1',
        type: 'Unmasked SSN & Medical Record #',
        location: 'Header Section · Reg. HIPAA-18',
        severity: 'critical',
        pos: [-0.3, 0.65, 0.03],
        remediatedText: '[PHI_REDACTED_TOK_0x9A]',
      },
      {
        id: 't2',
        type: 'Direct Genetic Sequencing Identifier',
        location: 'Diagnostic Table · Page 2',
        severity: 'high',
        pos: [0.35, 0.1, 0.03],
        remediatedText: '[ANONYMIZED_COHORT_ID]',
      },
    ],
  },
  'aws-secrets': {
    id: 'aws-secrets',
    title: 'AWS_Infra_Config.ts',
    type: 'code',
    size: '640 KB',
    hash: '0x9E21...A104',
    threats: [
      {
        id: 't1',
        type: 'Hardcoded AWS Secret Access Key',
        location: 'Line 42 · Shannon Entropy 4.91',
        severity: 'critical',
        pos: [-0.25, 0.45, 0.03],
        remediatedText: 'process.env.AWS_SECRET_KEY',
      },
      {
        id: 't2',
        type: 'RSA 4096-bit Private Key Block',
        location: 'Line 118 · TLS Certificate Store',
        severity: 'critical',
        pos: [0.2, -0.35, 0.03],
        remediatedText: '[HSM_BOUND_KEY_HANDLE]',
      },
    ],
  },
};

/* =========================================================================
   3D SUB-COMPONENTS
   ========================================================================= */

/** 3D Cyber Folder / Enclave Envelope */
const FolderMesh: React.FC<{
  phase: AnimationPhase;
  docType?: string;
}> = ({ phase }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const flapRef = useRef<THREE.Group>(null!);
  const lockRef = useRef<THREE.Mesh>(null!);

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    // Folder target position based on phase
    let targetZ = -0.3;
    let targetY = -0.25;
    let targetRotX = 0.15;
    let targetRotY = -0.2;
    let flapTargetRotX = 0; // closed

    if (phase === 'arrival') {
      targetZ = -0.1;
      targetY = 0;
      targetRotX = 0.05;
      targetRotY = 0;
      flapTargetRotX = 0; // closed flap
    } else if (phase === 'extracting') {
      targetZ = -0.5;
      targetY = -0.4;
      targetRotX = 0.25;
      targetRotY = -0.25;
      flapTargetRotX = -1.5; // open flap downward
    } else if (phase === 'scanning' || phase === 'secured') {
      targetZ = -0.7;
      targetY = -0.55;
      targetRotX = 0.35;
      targetRotY = -0.3;
      flapTargetRotX = -1.6; // wide open
    }

    // Smooth lerping
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, dt * 4.5);
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, dt * 4.5);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, dt * 4.5);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, dt * 4.5);

    if (flapRef.current) {
      flapRef.current.rotation.x = THREE.MathUtils.lerp(flapRef.current.rotation.x, flapTargetRotX, dt * 5.0);
    }

    if (lockRef.current) {
      const lockColor = phase === 'secured' ? '#34D399' : phase === 'scanning' ? '#F5A623' : '#2DD4BF';
      (lockRef.current.material as THREE.MeshBasicMaterial).color.set(lockColor);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -0.3]}>
      {/* Folder Back Plate (Translucent Deep Cyber Enclave) */}
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[2.3, 2.7, 0.04]} />
        <meshStandardMaterial
          color="#0B131E"
          roughness={0.2}
          metalness={0.8}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* Back Plate Glowing Neon Edges */}
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[2.34, 2.74, 0.02]} />
        <meshBasicMaterial color="#2DD4BF" wireframe transparent opacity={0.35} />
      </mesh>

      {/* Folder Tab at Top Left */}
      <mesh position={[-0.65, 1.45, -0.06]}>
        <boxGeometry args={[0.9, 0.24, 0.04]} />
        <meshStandardMaterial color="#121D2C" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[-0.65, 1.45, -0.04]}>
        <planeGeometry args={[0.8, 0.12]} />
        <meshBasicMaterial color="#2DD4BF" transparent opacity={0.6} />
      </mesh>

      {/* Internal Security Pocket / Sleeve */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[2.2, 1.8, 0.08]} />
        <meshStandardMaterial
          color="#070C14"
          roughness={0.3}
          metalness={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Hinged Front Flap with Cyber Seal */}
      <group ref={flapRef} position={[0, -1.1, 0.05]}>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[2.25, 1.8, 0.03]} />
          <meshStandardMaterial
            color="#0E1A29"
            roughness={0.15}
            metalness={0.85}
            transparent
            opacity={0.9}
          />
        </mesh>

        {/* Flap Decorative Cipher Stripes */}
        {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
          <mesh key={i} position={[x, 0.9, 0.02]}>
            <planeGeometry args={[0.25, 0.015]} />
            <meshBasicMaterial color="#2DD4BF" transparent opacity={0.4} />
          </mesh>
        ))}

        {/* Holographic Security Enclave Shield Badge */}
        <mesh ref={lockRef} position={[0, 1.45, 0.03]}>
          <circleGeometry args={[0.22, 24]} />
          <meshBasicMaterial color="#2DD4BF" transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 1.45, 0.035]}>
          <ringGeometry args={[0.24, 0.26, 24]} />
          <meshBasicMaterial color="#5EEAD4" transparent opacity={0.8} />
        </mesh>
      </group>
    </group>
  );
};

/** 3D Extracted Document Sheet with Live Code/Text Glyphs and Threat Zones */
const DocumentSheetMesh: React.FC<{
  phase: AnimationPhase;
  doc: DocumentInfo;
  selectedThreatId: string | null;
  onSelectThreat: (id: string) => void;
}> = ({ phase, doc, selectedThreatId, onSelectThreat }) => {
  const sheetRef = useRef<THREE.Group>(null!);

  useFrame((_, dt) => {
    if (!sheetRef.current) return;

    let targetY = -0.7;
    let targetZ = -0.2;
    let targetRotX = 0.15;
    let targetRotY = 0;
    let targetScale = 0.85;

    if (phase === 'arrival') {
      // Tucked completely inside folder
      targetY = -0.6;
      targetZ = -0.15;
      targetRotX = 0.15;
      targetRotY = 0;
      targetScale = 0.88;
    } else if (phase === 'extracting') {
      // Sliding out and floating up
      targetY = 0.25;
      targetZ = 0.35;
      targetRotX = -0.05;
      targetRotY = 0.05;
      targetScale = 1.0;
    } else if (phase === 'scanning' || phase === 'secured') {
      // In full inspection position
      targetY = 0.35;
      targetZ = 0.45;
      targetRotX = -0.02;
      targetRotY = 0;
      targetScale = 1.05;
    }

    sheetRef.current.position.y = THREE.MathUtils.lerp(sheetRef.current.position.y, targetY, dt * 4.0);
    sheetRef.current.position.z = THREE.MathUtils.lerp(sheetRef.current.position.z, targetZ, dt * 4.0);
    sheetRef.current.rotation.x = THREE.MathUtils.lerp(sheetRef.current.rotation.x, targetRotX, dt * 4.0);
    sheetRef.current.rotation.y = THREE.MathUtils.lerp(sheetRef.current.rotation.y, targetRotY, dt * 4.0);
    sheetRef.current.scale.setScalar(
      THREE.MathUtils.lerp(sheetRef.current.scale.x, targetScale, dt * 4.0)
    );
  });

  return (
    <group ref={sheetRef} position={[0, -0.6, -0.15]}>
      {/* Translucent Glassmorphic Document Core */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.75, 2.35, 0.035]} />
        <meshStandardMaterial
          color="#071018"
          roughness={0.1}
          metalness={0.3}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Cyber Border Wireframe */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.77, 2.37, 0.038]} />
        <meshBasicMaterial
          color={phase === 'secured' ? '#34D399' : '#2DD4BF'}
          wireframe
          transparent
          opacity={0.45}
        />
      </mesh>

      {/* Document Header Bar */}
      <mesh position={[0, 0.95, 0.02]}>
        <planeGeometry args={[1.5, 0.18]} />
        <meshBasicMaterial color="#121D2C" transparent opacity={0.9} />
      </mesh>

      {/* Document Header Accent Tag */}
      <mesh position={[-0.45, 0.95, 0.025]}>
        <planeGeometry args={[0.42, 0.08]} />
        <meshBasicMaterial color="#2DD4BF" transparent opacity={0.8} />
      </mesh>

      {/* Document Lines (Simulated Paragraphs / Security AST) */}
      {[0.75, 0.62, 0.48, 0.35, 0.22, 0.08, -0.05, -0.18, -0.32, -0.45, -0.6, -0.75, -0.88].map(
        (y, i) => {
          const isThreatLine = doc.threats.some((t) => Math.abs(t.pos[1] - y) < 0.12);
          const isRemediated = phase === 'secured';

          let lineColor = '#2DD4BF';
          let lineOpacity = 0.35;

          if (isThreatLine && (phase === 'scanning' || phase === 'extracting')) {
            lineColor = '#FB4A4A';
            lineOpacity = 0.85;
          } else if (isThreatLine && isRemediated) {
            lineColor = '#34D399';
            lineOpacity = 0.75;
          }

          const width = i % 4 === 0 ? 1.4 : i % 3 === 0 ? 1.2 : i % 2 === 0 ? 1.45 : 1.1;
          const xOffset = i % 2 === 0 ? -0.05 : 0.05;

          return (
            <mesh key={i} position={[xOffset, y, 0.022]}>
              <planeGeometry args={[width, 0.032]} />
              <meshBasicMaterial color={lineColor} transparent opacity={lineOpacity} />
            </mesh>
          );
        }
      )}

      {/* Forensic Corner Fold */}
      <mesh position={[0.74, 1.04, 0.025]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.22, 0.22]} />
        <meshBasicMaterial
          color={phase === 'secured' ? '#34D399' : '#5EEAD4'}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* 3D Threat Target Reticles and Markers */}
      {(phase === 'scanning' || phase === 'secured') &&
        doc.threats.map((threat) => {
          const isSelected = selectedThreatId === threat.id;
          const isSecured = phase === 'secured';
          const markerColor = isSecured
            ? '#34D399'
            : threat.severity === 'critical'
            ? '#FB4A4A'
            : '#F5A623';

          return (
            <group
              key={threat.id}
              position={threat.pos}
              onClick={(e) => {
                e.stopPropagation();
                onSelectThreat(threat.id);
              }}
            >
              {/* Outer pulsing ring */}
              <mesh position={[0, 0, 0.01]}>
                <ringGeometry args={[0.07, 0.09, 20]} />
                <meshBasicMaterial color={markerColor} transparent opacity={0.85} />
              </mesh>

              {/* Inner beacon dot */}
              <mesh position={[0, 0, 0.015]}>
                <circleGeometry args={[0.04, 16]} />
                <meshBasicMaterial color={markerColor} transparent opacity={0.95} />
              </mesh>

              {/* Small 3D highlight pin light */}
              <pointLight color={markerColor} intensity={isSelected ? 1.5 : 0.8} distance={0.8} />

              {/* Highlight bounding box if selected */}
              {isSelected && (
                <mesh position={[0, 0, 0.02]}>
                  <ringGeometry args={[0.12, 0.14, 24]} />
                  <meshBasicMaterial color="#5EEAD4" transparent opacity={0.9} />
                </mesh>
              )}
            </group>
          );
        })}

      {/* 3D Cryptographic Merkle Seal Stamp (Appears when Secured) */}
      {phase === 'secured' && (
        <group position={[0.45, -0.75, 0.03]}>
          <mesh>
            <circleGeometry args={[0.18, 24]} />
            <meshBasicMaterial color="#34D399" transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0, 0.005]}>
            <ringGeometry args={[0.2, 0.22, 24]} />
            <meshBasicMaterial color="#5EEAD4" transparent opacity={0.95} />
          </mesh>
          <pointLight color="#34D399" intensity={1.2} distance={1.0} />
        </group>
      )}
    </group>
  );
};

/** High-Intensity 3D Laser Scan Sweep Line */
const LaserScanSweep: React.FC<{
  active: boolean;
}> = ({ active }) => {
  const beamRef = useRef<THREE.Group>(null!);
  const glowPlaneRef = useRef<THREE.Mesh>(null!);
  const lightRef = useRef<THREE.PointLight>(null!);

  useFrame(({ clock }) => {
    if (!beamRef.current) return;
    if (!active) {
      beamRef.current.visible = false;
      return;
    }

    beamRef.current.visible = true;
    const t = clock.getElapsedTime() * 2.2;
    // Sweep up and down across the document bounds (-0.6 to 1.1)
    const yPos = 0.25 + Math.sin(t) * 0.95;
    beamRef.current.position.y = yPos;

    if (glowPlaneRef.current) {
      const mat = glowPlaneRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(t * 4) * 0.1;
    }

    if (lightRef.current) {
      lightRef.current.intensity = 1.6 + Math.sin(t * 4) * 0.4;
    }
  });

  return (
    <group ref={beamRef} position={[0, 0.25, 0.52]}>
      {/* Thin razor-sharp laser beam line */}
      <mesh>
        <boxGeometry args={[2.2, 0.015, 0.01]} />
        <meshBasicMaterial color="#5EEAD4" transparent opacity={0.95} />
      </mesh>

      {/* Trailing laser glow curtain */}
      <mesh ref={glowPlaneRef} position={[0, 0.15, -0.02]} rotation={[-0.1, 0, 0]}>
        <planeGeometry args={[2.1, 0.35]} />
        <meshBasicMaterial color="#2DD4BF" transparent opacity={0.4} />
      </mesh>

      <pointLight ref={lightRef} color="#2DD4BF" intensity={1.8} distance={1.6} />
    </group>
  );
};

/** Holographic Rotating Zero-Trust Perimeter Ring */
const ZeroTrustRing: React.FC<{ active: boolean }> = ({ active }) => {
  const ringRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }, dt) => {
    if (!ringRef.current) return;
    if (active) {
      ringRef.current.rotation.z += dt * 0.4;
      ringRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.5) * 0.15;
    }
  });

  if (!active) return null;

  return (
    <group ref={ringRef} position={[0, 0.35, 0.4]}>
      <mesh>
        <torusGeometry args={[1.7, 0.01, 16, 96]} />
        <meshBasicMaterial color="#34D399" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[1.55, 0.006, 16, 64]} />
        <meshBasicMaterial color="#2DD4BF" transparent opacity={0.4} />
      </mesh>
    </group>
  );
};

/** Floating Cyber Dust Particles */
const CyberParticles: React.FC = () => {
  const count = 75;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 7;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    return arr;
  }, []);

  const pointsRef = useRef<THREE.Points>(null!);
  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.getElapsedTime() * 0.03;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
      </bufferGeometry>
      <pointsMaterial size={0.024} color="#2DD4BF" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
};

/** Camera Parallax Rig responding to Mouse */
const InteractiveCameraRig: React.FC = () => {
  const { nx, ny } = useMousePosition();
  useFrame(({ camera }) => {
    camera.position.x += (nx * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (ny * 0.3 - camera.position.y) * 0.05;
    camera.lookAt(0, 0.1, 0);
  });
  return null;
};

/* =========================================================================
   SCENE CONTAINER
   ========================================================================= */

interface DocumentArrivalSceneProps {
  phase: AnimationPhase;
  documentKey: string;
  selectedThreatId: string | null;
  onSelectThreat: (id: string) => void;
  height?: string;
}

export const DocumentArrivalScene: React.FC<DocumentArrivalSceneProps> = ({
  phase,
  documentKey,
  selectedThreatId,
  onSelectThreat,
  height = '420px',
}) => {
  const reduced = useReducedMotion();
  const doc = SAMPLE_DOCUMENTS[documentKey] || SAMPLE_DOCUMENTS['prompt-injection'];

  if (reduced) {
    return (
      <div style={{ height }} className="w-full flex items-center justify-center p-6 bg-[var(--surface)]">
        <div className="text-center font-mono text-xs text-[var(--accent)]">
          <p className="font-bold mb-2">3D Enclave Inspection Active</p>
          <p className="text-[var(--text-3)]">{doc.title} · Phase: {phase.toUpperCase()}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full relative cursor-grab active:cursor-grabbing">
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <Canvas
          camera={{ position: [0, 0.2, 4.4], fov: 38 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 1.5]}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 5, 4]} intensity={0.8} />
          <pointLight position={[-3, 2, 2]} intensity={0.6} color="#7C5CFC" />
          <pointLight position={[3, -2, 1]} intensity={0.4} color="#2DD4BF" />

          <Float speed={1.4} rotationIntensity={0.06} floatIntensity={0.25}>
            <group position={[0, -0.1, 0]}>
              <FolderMesh phase={phase} docType={doc.type} />
              <DocumentSheetMesh
                phase={phase}
                doc={doc}
                selectedThreatId={selectedThreatId}
                onSelectThreat={onSelectThreat}
              />
              <LaserScanSweep active={phase === 'scanning'} />
              <ZeroTrustRing active={phase === 'secured'} />
            </group>
          </Float>

          <CyberParticles />
          <InteractiveCameraRig />
        </Canvas>
      </Suspense>
    </div>
  );
};

export default DocumentArrivalScene;
