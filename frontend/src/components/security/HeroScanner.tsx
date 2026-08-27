import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ─── 4 Detection Points with 3D Tilted Positions & Curved Lines ──── */
interface ThreatMarker {
  id: string;
  label: string;
  sub: string;
  color: string;
  glowColor: string;
  dotX: number; // Absolute X position over the 3D document
  dotY: number; // Absolute Y position over the 3D document
  labelY: number; // The Y position for the flat text label on the right
}

const THREAT_MARKERS: ThreatMarker[] = [
  {
    id: 'prompt-injection',
    label: 'PROMPT INJECTION',
    sub: 'Critical · 94% confidence',
    color: '#FB4A4A',
    glowColor: 'rgba(251, 74, 74, 0.55)',
    dotX: 320,
    dotY: 140,
    labelY: 110,
  },
  {
    id: 'pii-detected',
    label: 'PII DETECTED',
    sub: 'High · 87% confidence',
    color: '#F5A623',
    glowColor: 'rgba(245, 166, 35, 0.55)',
    dotX: 310,
    dotY: 250,
    labelY: 240,
  },
  {
    id: 'secret-detected',
    label: 'SECRET DETECTED',
    sub: 'High · 91% confidence',
    color: '#A855F7',
    glowColor: 'rgba(168, 85, 247, 0.55)',
    dotX: 295,
    dotY: 360,
    labelY: 380,
  },
  {
    id: 'safe-content',
    label: 'SAFE CONTENT',
    sub: 'Low Risk',
    color: '#34D399',
    glowColor: 'rgba(52, 211, 153, 0.55)',
    dotX: 285,
    dotY: 470,
    labelY: 500,
  },
];

export const HeroScanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeThreat, setActiveThreat] = useState<string>('prompt-injection');
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const targetOffset = useRef({ x: 0, y: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  /* Subtle Mouse Parallax */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    targetOffset.current = { x: dx * 6, y: dy * 6 }; // slightly stronger parallax
  }, []);

  const handleMouseLeave = useCallback(() => {
    targetOffset.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const tick = () => {
      currentOffset.current.x = lerp(currentOffset.current.x, targetOffset.current.x, 0.08);
      currentOffset.current.y = lerp(currentOffset.current.y, targetOffset.current.y, 0.08);
      setMouseOffset({
        x: +currentOffset.current.x.toFixed(2),
        y: +currentOffset.current.y.toFixed(2),
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* Cycle active highlight */
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveThreat((prev) => {
        const idx = THREAT_MARKERS.findIndex((m) => m.id === prev);
        return THREAT_MARKERS[(idx + 1) % THREAT_MARKERS.length].id;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const CALLOUT_START_X = 460; // Pushed right labels a bit further out

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative w-full max-w-[680px] h-[600px] sm:h-[640px] select-none overflow-visible ${className}`}
    >
      <div
        className="relative w-full h-full"
        style={{
          transform: `translate3d(${mouseOffset.x}px, ${mouseOffset.y}px, 0px)`,
          transition: 'none',
        }}
      >
        {/* ── 1. Concentric Scanner Rings (PERFECTLY CENTERED at X: 240, Y: 290) ── */}
        <div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: '240px',
            top: '290px',
            transform: 'translate(-50%, -50%)',
            width: '0px',
            height: '0px',
          }}
        >
          {/* Outer Ring */}
          <div
            className="absolute w-[540px] h-[540px] rounded-full border border-[#2DD4BF]/15 dark:border-[#2DD4BF]/20"
            style={{
              animation: 'hero-ring-rotate 40s linear infinite',
            }}
          >
            <div className="absolute top-1/2 -right-1.5 w-3 h-3 rounded-full bg-[#2DD4BF] shadow-[0_0_12px_#2DD4BF]" />
          </div>

          {/* Middle Dashed Ring */}
          <div
            className="absolute w-[440px] h-[440px] rounded-full border border-dashed border-[#2DD4BF]/25"
            style={{
              animation: 'hero-ring-rotate-reverse 30s linear infinite',
            }}
          >
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-3 bg-[#2DD4BF]/75" />
             <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-3 bg-[#2DD4BF]/75" />
          </div>
        </div>

        {/* ── 2. Holographic Pedestal Floor ── */}
        <div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: '230px',
            bottom: '-10px',
            transform: 'translateX(-50%)',
            width: '400px',
            height: '140px',
          }}
        >
          {/* Floor Rays */}
          <div
            className="absolute bottom-6 w-80 h-44 opacity-40"
            style={{
              background: 'radial-gradient(ellipse at 50% 100%, rgba(45, 212, 191, 0.45) 0%, transparent 70%)',
              clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
            }}
          />
          {/* Outer Floor Ring */}
          <div
            className="absolute bottom-1 w-80 h-24 rounded-full border border-[#2DD4BF]/50"
            style={{
              boxShadow: '0 0 40px rgba(45, 212, 191, 0.4)',
              transform: 'rotateX(75deg)',
            }}
          />
          {/* Inner Floor Ring */}
          <div
            className="absolute bottom-4 w-60 h-16 rounded-full border border-[#2DD4BF]/80 bg-[#2DD4BF]/15"
            style={{
              boxShadow: '0 0 30px rgba(45, 212, 191, 0.6)',
              transform: 'rotateX(75deg)',
            }}
          />
        </div>

        {/* ── 3. The TILTED 3D Security Document ── */}
        <div
          className="absolute z-20 w-[340px] h-[480px] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-300"
          style={{
            left: '60px',
            top: '40px',
            /* 3D Tilted Isometric View */
            transform: 'perspective(1100px) rotateX(15deg) rotateY(-18deg) rotateZ(5deg)',
            transformOrigin: 'center center',
            background: 'var(--surface-raised)',
            border: '1.5px solid var(--border-accent)',
            boxShadow:
              '0 30px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(45, 212, 191, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(24px)',
            animation: 'hero-doc-breathe 6s ease-in-out infinite alternate',
          }}
        >
          {/* Laser Scan Sweep with prominent green beam */}
          <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-30">
            {/* The bright horizontal laser line */}
            <div
              className="absolute -left-20 -right-20 h-[3px] pointer-events-none"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(45, 212, 191, 0.5) 20%, #2DD4BF 50%, rgba(45, 212, 191, 0.5) 80%, transparent 100%)',
                boxShadow: '0 0 15px #2DD4BF, 0 0 40px #2DD4BF, 0 0 60px rgba(45, 212, 191, 0.8)',
                animation: 'hero-laser-sweep 4s ease-in-out infinite',
              }}
            />
            {/* The trailing veil */}
            <div
              className="absolute left-0 right-0 h-40 pointer-events-none opacity-30"
              style={{
                background: 'linear-gradient(180deg, rgba(45, 212, 191, 0.3) 0%, transparent 100%)',
                animation: 'hero-laser-veil 4s ease-in-out infinite',
              }}
            />
          </div>

          {/* Corner Registration Brackets */}
          <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-[#2DD4BF]/80 rounded-tl-sm pointer-events-none" />
          <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-[#2DD4BF]/80 rounded-tr-sm pointer-events-none" />
          <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-[#2DD4BF]/80 rounded-bl-sm pointer-events-none" />
          <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-[#2DD4BF]/80 rounded-br-sm pointer-events-none" />

          {/* Header */}
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-[#2DD4BF]/15 border border-[#2DD4BF]/40 flex items-center justify-center text-[#2DD4BF]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-wider text-[var(--accent)] leading-none">
                    CONFIDENTIAL // NDA
                  </div>
                  <div className="text-[8px] font-mono text-[var(--text-3)] mt-0.5">
                    DOC-SEC-09471 · TEE BUFFER
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2DD4BF]/10 border border-[#2DD4BF]/30 text-[8px] font-mono text-[var(--accent)] font-bold">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span>ENCLAVE</span>
              </div>
            </div>

            {/* Content Lines */}
            <div className="space-y-6 pt-2">
              <div>
                <div className="text-[9px] font-mono font-bold tracking-wide text-[var(--text-2)] mb-1.5 flex justify-between pr-8">
                  <span>1.0 PROPRIETARY RECURSIVE CLAUSE</span>
                  <span className="text-[7.5px] text-[var(--text-3)]">SEC 4.2</span>
                </div>
                <div className="space-y-2 opacity-70 pr-8">
                  <div className="h-2 w-full bg-[var(--text-3)]/35 rounded" />
                  <div className="h-2 w-4/5 bg-[var(--text-3)]/35 rounded" />
                  <div className="h-2 w-11/12 bg-[var(--text-3)]/35 rounded" />
                </div>
              </div>

              <div className="pt-2">
                <div className="text-[9px] font-mono font-bold tracking-wide text-[var(--text-2)] mb-1.5 flex justify-between pr-8">
                  <span>2.1 PARTY IDENTIFIERS &amp; DISCLOSURE</span>
                  <span className="text-[7.5px] text-[var(--text-3)]">SEC 9.1</span>
                </div>
                <div className="space-y-2 opacity-70 pr-8">
                  <div className="h-2 w-full bg-[var(--text-3)]/35 rounded" />
                  <div className="h-2 w-3/4 bg-[var(--text-3)]/35 rounded" />
                  <div className="h-2 w-5/6 bg-[var(--text-3)]/35 rounded" />
                </div>
              </div>

              <div className="pt-2">
                <div className="text-[9px] font-mono font-bold tracking-wide text-[var(--text-2)] mb-1.5 flex justify-between pr-8">
                  <span>3.0 CRYPTOGRAPHIC SIGNATURE</span>
                  <span className="text-[7.5px] text-[var(--text-3)]">ROOT 0x8F</span>
                </div>
                <div className="space-y-2 opacity-70 pr-8">
                  <div className="h-2 w-full bg-[var(--text-3)]/35 rounded" />
                  <div className="h-2 w-2/3 bg-[var(--text-3)]/35 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[9px] font-mono text-[var(--text-3)]">
            <span className="truncate">SHA256: 0x8F92...B471</span>
            <span className="text-[#34D399] font-bold shrink-0">✓ ATTESTED</span>
          </div>
        </div>

        {/* ── 4. Target Glowing Dots OVER the Document (2D Space) ── */}
        {THREAT_MARKERS.map((tm) => {
          const isSelected = activeThreat === tm.id;
          return (
            <div
              key={tm.id}
              onClick={() => setActiveThreat(tm.id)}
              className="absolute z-40 cursor-pointer"
              style={{
                left: `${tm.dotX}px`,
                top: `${tm.dotY}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* Outer Ping */}
              <div
                className="absolute -inset-3.5 rounded-full animate-ping opacity-50 pointer-events-none"
                style={{ backgroundColor: tm.color }}
              />
              {/* Middle Halo */}
              <div
                className="absolute -inset-2 rounded-full border border-white/60 pointer-events-none"
                style={{
                  backgroundColor: `${tm.color}30`,
                  boxShadow: `0 0 15px ${tm.color}`,
                }}
              />
              {/* Core Dot */}
              <div
                className={`relative w-4 h-4 sm:w-5 sm:h-5 rounded-full border-[1.5px] border-white flex items-center justify-center transition-transform duration-200 ${
                  isSelected ? 'scale-125' : 'hover:scale-110'
                }`}
                style={{
                  backgroundColor: tm.color,
                  boxShadow: `0 0 12px ${tm.color}, 0 0 24px ${tm.glowColor}`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          );
        })}

        {/* ── 5. Beautiful Curved SVG Bezier Lines ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
          viewBox="0 0 680 640"
        >
          {THREAT_MARKERS.map((tm) => {
            const isSelected = activeThreat === tm.id;
            // Line starts EXACTLY at the center of the 2D dot
            const startX = tm.dotX;
            const startY = tm.dotY;
            const endX = CALLOUT_START_X - 10;
            const endY = tm.labelY;

            // Smooth bezier curve control points
            const cp1X = startX + 50;
            const cp1Y = startY;
            const cp2X = endX - 60;
            const cp2Y = endY;

            return (
              <g key={tm.id}>
                <path
                  d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                  stroke={tm.color}
                  strokeWidth={isSelected ? '1.75' : '1.2'}
                  strokeDasharray="4 4"
                  fill="none"
                  opacity={isSelected ? 0.95 : 0.5}
                  className="transition-all duration-300"
                />
                <circle
                  cx={endX}
                  cy={endY}
                  r={isSelected ? 2.5 : 2}
                  fill={tm.color}
                  opacity={isSelected ? 1 : 0.75}
                  className="transition-all duration-300"
                />
              </g>
            );
          })}
        </svg>

        {/* ── 6. Threat Callout Labels on Right ── */}
        {THREAT_MARKERS.map((tm) => {
          const isSelected = activeThreat === tm.id;
          return (
            <div
              key={tm.id}
              onClick={() => setActiveThreat(tm.id)}
              className={`absolute cursor-pointer transition-all duration-300 text-left z-40 ${
                isSelected ? 'scale-105' : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                left: `${CALLOUT_START_X}px`,
                top: `${tm.labelY}px`,
                transform: 'translateY(-6px)', // Align center of title with endY exactly
              }}
            >
              {/* First Row: Dot + Label */}
              <div className="flex items-center gap-2 h-[12px]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: tm.color,
                    boxShadow: isSelected ? `0 0 12px ${tm.color}` : 'none',
                  }}
                />
                <span
                  className="text-[11px] sm:text-[12px] font-mono font-bold tracking-wider leading-none mt-0.5"
                  style={{ color: tm.color }}
                >
                  {tm.label}
                </span>
              </div>
              {/* Second Row: Subtitle */}
              <div className="text-[9px] sm:text-[10px] font-mono text-[var(--text-3)] pl-4.5 mt-1 leading-none">
                {tm.sub}
              </div>
            </div>
          );
        })}

        {/* ── 7. Top-Right Status Pill (LIVE ANALYSIS) ── */}
        <div
          className="absolute top-1 right-2 sm:right-6 z-40 flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--surface-alt)] backdrop-blur-xl border border-[var(--border-accent)] shadow-[var(--shadow-md)] pointer-events-none"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2DD4BF] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2DD4BF]" />
          </span>
          <div className="text-left">
            <div className="text-[9px] font-mono font-bold text-[var(--accent)] tracking-widest leading-tight uppercase">
              LIVE ANALYSIS
            </div>
            <div className="text-[8px] font-mono text-[var(--text-3)] leading-none mt-0.5">
              Document scanning in progress...
            </div>
          </div>
        </div>

        {/* ── 8. Bottom-Left Document Metadata Chip ── */}
        <div
          className="absolute bottom-6 left-6 sm:left-10 z-40 flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--surface-alt)] backdrop-blur-xl border border-[var(--border)] shadow-[var(--shadow-lg)] pointer-events-none"
        >
          <div className="w-8 h-8 rounded-lg bg-[#2DD4BF]/15 border border-[#2DD4BF]/30 flex items-center justify-center text-[var(--accent)] shrink-0">
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-[10px] font-mono font-bold text-[var(--text-1)] leading-tight">
              Adversarial_NDA.pdf
            </div>
            <div className="text-[8px] font-mono text-[var(--text-3)] leading-tight mt-1">
              2.4 MB · SECURE ANALYSIS
            </div>
            <div className="text-[7.5px] font-mono text-[var(--accent)] leading-tight mt-0.5">
              TEE: Intel SGX / AWS Nitro
            </div>
          </div>
        </div>

        {/* ── 9. Bottom-Right Circular Risk Gauge ── */}
        <div
          className="absolute bottom-8 right-8 sm:right-12 z-40 flex flex-col items-center justify-center p-2 rounded-2xl bg-[var(--surface-alt)] backdrop-blur-xl border border-[var(--border-accent)] shadow-[var(--shadow-lg)] pointer-events-none w-20 h-20"
        >
          <div className="relative w-12 h-12 flex items-center justify-center">
            {/* SVG Arc Gauge */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-[var(--border)]"
                strokeWidth="3"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-[#34D399]"
                strokeDasharray="12, 100"
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[7px] font-mono text-[var(--text-3)] uppercase leading-none">RISK</span>
              <span className="text-[13px] font-mono font-bold text-[var(--text-1)] leading-none my-0.5">12%</span>
              <span className="text-[6.5px] font-mono font-bold text-[#34D399] uppercase leading-none">LOW</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroScanner;
