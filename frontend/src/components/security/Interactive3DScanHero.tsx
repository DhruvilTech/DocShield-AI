import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Button, Card, cn } from '../ui';
import {
  DocumentArrivalScene,
  AnimationPhase,
  SAMPLE_DOCUMENTS,
} from '../three/DocumentArrivalScene';

interface Interactive3DScanHeroProps {
  className?: string;
}

export const Interactive3DScanHero: React.FC<Interactive3DScanHeroProps> = ({
  className,
}) => {
  const [selectedDocKey, setSelectedDocKey] = useState<string>('prompt-injection');
  const [phase, setPhase] = useState<AnimationPhase>('arrival');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedThreatId, setSelectedThreatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'threats' | 'enclave'>('threats');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doc = SAMPLE_DOCUMENTS[selectedDocKey] || SAMPLE_DOCUMENTS['prompt-injection'];

  // Automatic phase progression sequence
  const runSequence = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setPhase('arrival');
    setSelectedThreatId(null);

    timerRef.current = setTimeout(() => {
      setPhase('extracting');
      timerRef.current = setTimeout(() => {
        setPhase('scanning');
        // Highlight first threat after scan begins
        timerRef.current = setTimeout(() => {
          if (doc.threats[0]) setSelectedThreatId(doc.threats[0].id);
          timerRef.current = setTimeout(() => {
            setPhase('secured');
            setSelectedThreatId(null);
          }, 3200);
        }, 1200);
      }, 2000);
    }, 1400);
  }, [doc]);

  useEffect(() => {
    if (isPlaying) {
      runSequence();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [selectedDocKey, isPlaying, runSequence]);

  const handleSelectPhase = (targetPhase: AnimationPhase) => {
    setIsPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase(targetPhase);
    if (targetPhase === 'scanning') {
      if (doc.threats[0]) setSelectedThreatId(doc.threats[0].id);
    } else if (targetPhase === 'secured') {
      setSelectedThreatId(null);
    }
  };

  const handleRemediate = () => {
    setIsPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase('secured');
    setSelectedThreatId(null);
  };

  const PHASES_CONFIG: { id: AnimationPhase; label: string; step: string; icon: string }[] = [
    { id: 'arrival', label: 'Capsule Ingest', step: '01', icon: '📦' },
    { id: 'extracting', label: 'AST Extract', step: '02', icon: '📄' },
    { id: 'scanning', label: 'Neural Scan', step: '03', icon: '⚡' },
    { id: 'secured', label: 'Zero-Trust Seal', step: '04', icon: '🛡️' },
  ];

  return (
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden border border-[var(--border-accent)] bg-[var(--surface)] shadow-[var(--shadow-lg)] backdrop-blur-xl',
        className
      )}
    >
      {/* Top Header Bar & Document Switcher */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-alt)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FB4A4A]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#34D399]/70" />
          </div>
          <span className="text-[11px] font-mono text-[var(--accent)] font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
            TEE://ENCLAVE-3D-SIMULATOR
          </span>
        </div>

        {/* Document Selector Pills */}
        <div className="flex items-center gap-1 bg-[var(--surface-raised)] p-1 rounded-lg border border-[var(--border)]">
          {Object.entries(SAMPLE_DOCUMENTS).map(([key, d]) => (
            <button
              key={key}
              onClick={() => {
                setSelectedDocKey(key);
                setIsPlaying(true);
              }}
              className={cn(
                'px-2.5 py-1 text-[10px] font-mono rounded-md transition-all duration-150',
                selectedDocKey === key
                  ? 'bg-[var(--accent)] text-[#05070A] font-bold shadow-[var(--glow-sm)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              )}
            >
              {key === 'prompt-injection'
                ? 'Prompt Injection'
                : key === 'patient-phi'
                ? 'HIPAA PHI'
                : 'AWS Secrets'}
            </button>
          ))}
        </div>
      </div>

      {/* Phase Stepper & Interactive Progress Bar */}
      <div className="px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {PHASES_CONFIG.map((p, idx) => {
            const isActive = phase === p.id;
            const isCompleted =
              (phase === 'extracting' && idx === 0) ||
              (phase === 'scanning' && idx <= 1) ||
              (phase === 'secured' && idx <= 3);

            return (
              <button
                key={p.id}
                onClick={() => handleSelectPhase(p.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-150',
                  isActive
                    ? 'bg-[var(--accent-muted)] border border-[var(--border-accent)] text-[var(--accent)] font-bold shadow-[0_0_10px_rgba(45,212,191,0.15)]'
                    : isCompleted
                    ? 'text-[var(--safe)] hover:bg-[var(--surface-raised)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-raised)]'
                )}
              >
                <span>{p.icon}</span>
                <span className="opacity-60">{p.step}.</span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Play / Replay Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
                if (timerRef.current) clearTimeout(timerRef.current);
              } else {
                setIsPlaying(true);
                runSequence();
              }
            }}
            className="p-1.5 rounded-md border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--accent)] hover:border-[var(--border-accent)] bg-[var(--surface)] text-[10px] font-mono flex items-center gap-1"
            title={isPlaying ? 'Pause auto-play' : 'Play auto sequence'}
          >
            {isPlaying ? '⏸ Pause' : '▶ Auto Flow'}
          </button>
          <button
            onClick={() => {
              setIsPlaying(true);
              runSequence();
            }}
            className="p-1.5 rounded-md border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--accent)] hover:border-[var(--border-accent)] bg-[var(--surface)] text-[10px] font-mono"
            title="Replay from file arrival"
          >
            ↺ Replay
          </button>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="relative h-[340px] sm:h-[380px] bg-gradient-to-b from-[var(--bg-void)] to-[var(--bg-surface)] flex items-center justify-center overflow-hidden">
        {/* Holographic grid background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25 tech-grid-dense"
          style={{
            maskImage: 'radial-gradient(circle at center, black 40%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 80%)',
          }}
        />

        {/* Floating status badge on top right of 3D canvas */}
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <Badge
            variant={
              phase === 'secured'
                ? 'safe'
                : phase === 'scanning'
                ? 'threat'
                : phase === 'extracting'
                ? 'warning'
                : 'ai'
            }
            dot
            size="sm"
          >
            {phase === 'arrival' && 'Enclave Ingesting...'}
            {phase === 'extracting' && 'Extracting AST Payload...'}
            {phase === 'scanning' && `${doc.threats.length} Threat Vectors Flagged`}
            {phase === 'secured' && 'Zero-Trust Merkle Seal Active'}
          </Badge>
        </div>

        {/* 3D Scene */}
        <DocumentArrivalScene
          phase={phase}
          documentKey={selectedDocKey}
          selectedThreatId={selectedThreatId}
          onSelectThreat={(id) => {
            setSelectedThreatId(id);
            setPhase('scanning');
          }}
          height="100%"
        />

        {/* Floating document title pill at bottom-left */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none bg-[var(--surface)]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[var(--border)] shadow-[var(--shadow-sm)]">
          <p className="text-[11px] font-bold font-mono text-[var(--text-1)]">{doc.title}</p>
          <p className="text-[9px] font-mono text-[var(--text-3)]">
            Size: {doc.size} · SHA: {doc.hash}
          </p>
        </div>

        {/* Prompt hint on bottom right */}
        <div className="absolute bottom-3 right-3 z-10 pointer-events-none text-[9px] font-mono text-[var(--text-3)] hidden sm:block">
          ✨ Hover & drag to inspect in 3D
        </div>
      </div>

      {/* Interactive Threat & Telemetry Footer Drawer */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-alt)]">
        {/* Navigation tabs inside the drawer */}
        <div className="px-4 pt-2.5 pb-1 flex items-center justify-between border-b border-[var(--border)] text-xs font-mono">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('threats')}
              className={cn(
                'pb-1.5 border-b-2 font-semibold transition-colors',
                activeTab === 'threats'
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
              )}
            >
              Detected Findings ({doc.threats.length})
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={cn(
                'pb-1.5 border-b-2 font-semibold transition-colors',
                activeTab === 'telemetry'
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
              )}
            >
              Live Enclave Telemetry
            </button>
          </div>

          {phase === 'scanning' && (
            <Button size="sm" variant="primary" onClick={handleRemediate} className="h-7 text-[11px]">
              🛡️ Sanitize & Seal Proof
            </Button>
          )}
        </div>

        {/* Drawer Content */}
        <div className="p-3 sm:p-4 min-h-[110px]">
          <AnimatePresence mode="wait">
            {activeTab === 'threats' ? (
              <motion.div
                key="threats"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <div className="grid sm:grid-cols-2 gap-2">
                  {doc.threats.map((threat) => {
                    const isSelected = selectedThreatId === threat.id;
                    const isSecured = phase === 'secured';

                    return (
                      <div
                        key={threat.id}
                        onClick={() => {
                          setSelectedThreatId(threat.id);
                          setPhase('scanning');
                        }}
                        className={cn(
                          'p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-150',
                          isSelected
                            ? 'border-[var(--border-accent)] bg-[var(--accent-muted)] shadow-[var(--glow-sm)]'
                            : isSecured
                            ? 'border-[#34D399]/30 bg-[#34D399]/5'
                            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={cn(
                              'font-bold truncate text-[11px]',
                              isSecured ? 'text-[var(--safe)] line-through' : 'text-[var(--text-1)]'
                            )}
                          >
                            {threat.type}
                          </span>
                          <Badge
                            variant={isSecured ? 'safe' : threat.severity === 'critical' ? 'threat' : 'warning'}
                            size="sm"
                          >
                            {isSecured ? 'NEUTRALIZED' : threat.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-[var(--text-3)] font-mono truncate">
                          {isSecured && threat.remediatedText ? (
                            <span className="text-[var(--safe)] font-semibold">
                              Token Redacted: {threat.remediatedText}
                            </span>
                          ) : (
                            threat.location
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="telemetry"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="font-mono text-[10px] space-y-1.5 text-[var(--text-3)] bg-[var(--bg-void)] p-3 rounded-lg border border-[var(--border)]"
              >
                <div className="flex justify-between text-[var(--text-2)]">
                  <span>[TEE MEMORY]: Intel SGX Enclave allocated at 0x7FFF8A10</span>
                  <span className="text-[var(--safe)]">ISOLATED</span>
                </div>
                <div className="flex justify-between">
                  <span>[AST PARSER]: 1,482 syntax nodes decompiled in 1.4ms</span>
                  <span className="text-[var(--accent)]">READY</span>
                </div>
                <div className="flex justify-between">
                  <span>[NEURAL ENGINES]: 6 models active (Prompt Injection + PII + Forensics)</span>
                  <span className="text-[var(--safe)]">100% HEALTH</span>
                </div>
                <div className="flex justify-between text-[var(--text-1)] font-semibold pt-1 border-t border-[var(--border)]">
                  <span>MERKLE AUDIT ROOT: 0x9f4a8c21e07b41d99a22f3e8</span>
                  <span className="text-[var(--accent)]">ED25519 SIGNED</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Interactive3DScanHero;
