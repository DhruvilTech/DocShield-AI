// src/components/security/ScannerStandbyView.tsx
import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Card, Badge, cn } from '../ui';
import { DocShieldLogo } from '../common/DocShieldLogo';
import { Shield, Cpu, Lock, Sparkles, Activity, FileCheck, Radio } from 'lucide-react';

interface ScannerStandbyViewProps {
  selectedDocType?: string;
  onSelectSample?: (type: string) => void;
}

export const ScannerStandbyView: React.FC<ScannerStandbyViewProps> = ({
  selectedDocType = 'PASSPORT',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parallax Tilt for Holographic Document Wireframe
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 20, stiffness: 150 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [12, -12]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <Card
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="p-6 md:p-8 h-full flex flex-col justify-between min-h-[560px] border-[var(--border-accent)] bg-[var(--surface)] relative overflow-hidden shadow-[var(--shadow-md)]"
    >
      {/* Background Cybernetic Hologram Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: '28px 28px',
        }}
      />

      {/* Rotating Cyber Radar Concentric Rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 pointer-events-none opacity-25">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
          className="w-full h-full rounded-full border border-dashed border-[var(--accent)]"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-8 rounded-full border border-[var(--accent)] opacity-50"
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-20 rounded-full border-2 border-[var(--accent)]"
        />
        {/* Radar Sweep Beam */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg at 50% 50%, rgba(45,212,191,0.25) 0deg, transparent 60deg, transparent 360deg)',
          }}
        />
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between border-b border-[var(--border)] pb-4 mb-4">
        <div className="flex items-center gap-3">
          <DocShieldLogo size="sm" animated glow />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[var(--text-1)]">
                AI Screening Enclave Standby
              </h3>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-3)] font-mono">
              Ready for Document Stream · Hardware TEE Active
            </p>
          </div>
        </div>

        <Badge variant="accent" size="sm" className="font-mono">
          <Radio className="w-3 h-3 animate-pulse text-[var(--accent)]" />
          ENCLAVE ARMED
        </Badge>
      </div>

      {/* Center Stage: Interactive Holographic Document Blueprint */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-4">
        <motion.div
          style={{
            perspective: 1000,
            rotateX,
            rotateY,
            transformStyle: 'preserve-3d',
          }}
          className="w-full max-w-[340px] aspect-[1.58/1] rounded-2xl border-2 border-[var(--border-accent)] bg-[var(--surface-raised)]/80 backdrop-blur-md p-4 relative shadow-[0_12px_36px_rgba(45,212,191,0.15)] flex flex-col justify-between group hover:border-[var(--accent)] transition-colors"
        >
          {/* Hologram Corner Target Marks */}
          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[var(--accent)]" />
          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[var(--accent)]" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[var(--accent)]" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[var(--accent)]" />

          {/* Sweeping Laser Line inside Document Blueprint */}
          <motion.div
            animate={{ top: ['0%', '98%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' }}
            className="absolute left-0 right-0 h-[2px] pointer-events-none z-20"
            style={{
              background: 'linear-gradient(90deg, transparent, #2DD4BF, #FFFFFF, #2DD4BF, transparent)',
              boxShadow: '0 0 12px #2DD4BF',
            }}
          />

          {/* Document Header Hologram */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-[11px] font-mono font-bold tracking-wider text-[var(--text-1)] uppercase">
                {selectedDocType} SECURITY BLUEPRINT
              </span>
            </div>
            <span className="text-[9px] font-mono text-[var(--safe)] px-1.5 py-0.5 rounded bg-[var(--surface-alt)] border border-[var(--border)] font-bold">
              ICAO 9303
            </span>
          </div>

          {/* Document Body Hologram Grid */}
          <div className="grid grid-cols-12 gap-3 my-2 items-center">
            {/* Photo Silhouette Placeholder */}
            <div className="col-span-4 aspect-[3/4] rounded-lg border border-dashed border-[var(--accent)] bg-[var(--surface-alt)] flex flex-col items-center justify-center relative overflow-hidden">
              <span className="text-xl opacity-70">👤</span>
              <span className="text-[8px] font-mono text-[var(--accent)] mt-1 font-bold">BIOMETRIC</span>
              <motion.div
                animate={{ opacity: [0.2, 0.7, 0.2] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-[var(--accent)]/10"
              />
            </div>

            {/* Credential Data Lines Wireframe */}
            <div className="col-span-8 space-y-2">
              <div className="space-y-1">
                <div className="h-2 w-28 rounded bg-[var(--accent)]/25" />
                <div className="h-2 w-40 rounded bg-[var(--text-3)]/20" />
                <div className="h-2 w-32 rounded bg-[var(--text-3)]/20" />
              </div>

              {/* Optical Chip & Security Features */}
              <div className="flex items-center gap-2 pt-1">
                <div className="w-5 h-4 rounded border border-[var(--accent)] bg-[var(--accent-muted)] flex items-center justify-center text-[7px] font-mono text-[var(--accent)] font-bold">
                  CHIP
                </div>
                <div className="text-[9px] font-mono text-[var(--text-3)]">
                  SHA-256 Merkle DAG Verified
                </div>
              </div>
            </div>
          </div>

          {/* MRZ Optical Zone Wireframe */}
          <div className="p-1.5 rounded bg-[var(--surface-alt)] border border-[var(--border)] font-mono text-[8px] text-[var(--text-3)] tracking-widest leading-none space-y-1">
            <div className="truncate">P&lt;UTOERIKSSON&lt;&lt;ANNA&lt;MARIA&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div>
            <div className="truncate">L898902C36UTO7408122F1204159ZE184226B&lt;&lt;&lt;&lt;10</div>
          </div>
        </motion.div>

        {/* Instructional Prompt Below Blueprint */}
        <p className="text-xs text-[var(--text-2)] font-mono mt-4 text-center max-w-sm">
          Select a credential or upload a document on the left to initiate real-time OCR extraction, forensic tampering checks, and live biometric verification.
        </p>
      </div>

      {/* Bottom Telemetry Matrix (4 Engine Status Chips) */}
      <div className="relative z-10 pt-4 border-t border-[var(--border)]">
        <div className="text-[10px] font-mono text-[var(--text-3)] uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
          <span>Active Pipeline Enclave Engines</span>
          <span className="text-[var(--accent)]">4 of 4 Ready</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
          <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-0.5">
              <span>MOD 1: OCR</span>
              <span className="text-[var(--safe)] font-bold">● 99.4%</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-[var(--text-1)] block truncate">
              MRZ 7-3-1 Matrix
            </span>
          </div>

          <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-0.5">
              <span>MOD 2: SLTD</span>
              <span className="text-[var(--safe)] font-bold">● 100%</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-[var(--text-1)] block truncate">
              Interpol Watchlist
            </span>
          </div>

          <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-0.5">
              <span>MOD 3: TAMPER</span>
              <span className="text-[var(--safe)] font-bold">● 98.8%</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-[var(--text-1)] block truncate">
              Forensic AI Layer
            </span>
          </div>

          <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-0.5">
              <span>MOD 4: BIOMETRIC</span>
              <span className="text-[var(--safe)] font-bold">● 99.1%</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-[var(--text-1)] block truncate">
              Cosine 3D Match
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
