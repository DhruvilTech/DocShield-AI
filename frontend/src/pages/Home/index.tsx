import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Badge, Card, SectionHeader, cn, CountUp, Reveal, RevealTilt } from '../../components/ui';
import { ThreatNode, SecurityRing, VerificationAnimation, ScanLine, Interactive3DScanHero } from '../../components/security';

/* ---- Animation variants ---- */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const } },
});

/* ---- Live status ticker ---- */
const LiveTicker: React.FC = () => {
  return (
    <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-[var(--border-accent)] bg-[var(--surface)] text-xs text-[var(--text-2)] font-mono shadow-[var(--shadow-sm)]">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--safe)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--safe)]" />
      </span>
      <span>
        <span className="text-[var(--text-1)] font-bold">
          <CountUp value={31847921} />
        </span> threats neutralized across enterprise estates
      </span>
    </div>
  );
};

/* ---- Hero Section with Interactive 3D Document Arrival & Scan Console ---- */
const Hero: React.FC = () => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16 pb-12">
      {/* Background ambient lighting vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 30%, rgba(0,184,169,0.07) 0%, transparent 65%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 w-full">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Copy & Command Callouts */}
          <div className="lg:col-span-6">
            <motion.div {...fadeUp(0)} className="mb-6">
              <LiveTicker />
            </motion.div>

            <motion.h1
              {...fadeUp(0.08)}
              className="text-4xl sm:text-5xl xl:text-6xl font-bold text-[var(--text-1)] tracking-tight leading-[1.08] mb-6"
            >
              Document security
              <br />
              <span className="accent-text">built for AI</span>
              <br />
              <span className="text-[var(--text-2)] text-3xl sm:text-4xl xl:text-5xl font-normal">threats.</span>
            </motion.h1>

            <motion.p {...fadeUp(0.14)} className="text-base sm:text-lg text-[var(--text-2)] leading-relaxed max-w-xl mb-8">
              DocShield AI intercepts prompt injections, sensitive PII/PHI exposures, credential leaks, and document fraud before they reach LLMs, employees, or third parties.
            </motion.p>

            <motion.div {...fadeUp(0.2)} className="flex flex-wrap items-center gap-3">
              <Link to="/scanner">
                <Button size="lg" variant="primary">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Scan a Document Free
                </Button>
              </Link>

              <a href="#interactive-sandbox">
                <Button size="lg" variant="secondary">
                  <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Explore 3D Enclave Demo
                </Button>
              </a>
            </motion.div>

            {/* Compliance certifications strip */}
            <motion.div {...fadeUp(0.28)} className="mt-10 flex flex-wrap items-center gap-4 text-xs text-[var(--text-3)] font-mono">
              {['SOC 2 Type II Certified', 'HIPAA 18 PHI Safe Harbor', 'GDPR Article 9', 'FIPS 140-3 Hardware TEE'].map((cert) => (
                <span key={cert} className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-[var(--safe)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {cert}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right Column: 3D Interactive Document Arrival, Extraction & Scan Terminal */}
          <motion.div {...fadeUp(0.12)} className="lg:col-span-6 relative">
            <Interactive3DScanHero />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

/* ---- Features Grid Section with Laser-Border Hover Effects ---- */
const FEATURES = [
  {
    icon: '🛡️',
    label: 'Adversarial Prompt Injection Defense',
    description: 'Intercepts hidden LLM jailbreaks, recursive prompt escapes, and adversarial zero-width unicode before ingestion.',
    badge: 'AI Security',
    badgeVariant: 'ai' as const,
    link: '/scanner',
  },
  {
    icon: '🔒',
    label: 'Deterministic PII & PHI Redaction',
    description: 'Detects 140+ international identifier formats and replaces sensitive cleartext with cryptographically secure tokens.',
    badge: 'GDPR / HIPAA',
    badgeVariant: 'info' as const,
    link: '/analysis',
  },
  {
    icon: '🧬',
    label: 'Steganographic Forensic Watermarking',
    description: 'Embeds invisible forensic fingerprints into documents that survive OCR, print-scan cycles, and screenshot attacks.',
    badge: 'Forensics',
    badgeVariant: 'accent' as const,
    link: '/analysis',
  },
  {
    icon: '🔑',
    label: 'Secret & Credential Interception',
    description: 'Calculates Shannon entropy to identify hardcoded RSA private keys, AWS tokens, and database credentials.',
    badge: 'Secrets',
    badgeVariant: 'threat' as const,
    link: '/threats',
  },
  {
    icon: '⚖️',
    label: 'Continuous Compliance Assurance',
    description: 'Generates immutable Merkle-tree proofs mapped to SOC 2 Type II, HIPAA, and OWASP LLM Top 10 frameworks.',
    badge: 'SOC 2 Ready',
    badgeVariant: 'safe' as const,
    link: '/security',
  },
  {
    icon: '🏛️',
    label: 'Zero-Trust Cryptographic Vault',
    description: 'Stores sanitized documents in hardware-isolated enclave storage protected by role-bound ephemeral keys.',
    badge: 'Zero-Trust',
    badgeVariant: 'accent' as const,
    link: '/vault',
  },
];

const FeaturesSection: React.FC = () => (
  <section className="py-20 bg-transparent border-y border-[var(--border)]">
    <Reveal className="max-w-7xl mx-auto px-4 sm:px-6">
      <SectionHeader
        eyebrow="Intelligence Layer"
        title={<>6 security engines,<br /><span className="text-[var(--text-2)] font-normal">one unified platform<span className="text-[var(--accent)]">.</span></span></>}
        description="Every document upload passes through six specialized neural models running simultaneously in hardware-isolated TEE memory."
      />

      <RevealTilt className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => (
          <div key={f.label} data-tilt-card="">
            <Link to={f.link}>
              <Card interactive className="p-5 h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl">{f.icon}</span>
                    <Badge variant={f.badgeVariant} size="sm">{f.badge}</Badge>
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-1)] mb-2">{f.label}</h3>
                  <p className="text-xs text-[var(--text-2)] leading-relaxed">{f.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-mono text-[var(--accent)] font-semibold">
                  <span>Explore Module</span>
                  <span>→</span>
                </div>
              </Card>
            </Link>
          </div>
        ))}
      </RevealTilt>
    </Reveal>
  </section>
);

/* ---- Interactive 3D Document Arrival & Laser Scanning Laboratory Section ---- */
const InteractiveSandboxSection: React.FC = () => {
  return (
    <section id="interactive-sandbox" className="py-24 relative overflow-hidden bg-transparent">
      {/* Subtle background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(45,212,191,0.06) 0%, transparent 70%)',
        }}
      />

      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <SectionHeader
          eyebrow="Interactive 3D Enclave Laboratory"
          title={
            <>
              Real-time 3D file arrival,
              <br />
              <span className="accent-text">extraction &amp; neural laser scan.</span>
            </>
          }
          description="Test live sandboxed document threats. Watch encrypted capsules arrive via mTLS, extract AST payloads in hardware memory, detect prompt injections with 3D laser sweeps, and lock Merkle proofs."
        />

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Main 3D Simulator Console */}
          <div className="lg:col-span-8">
            <Interactive3DScanHero />
          </div>

          {/* Side Explanatory Guidance Cards */}
          <div className="lg:col-span-4 space-y-3">
            {[
              {
                step: '01',
                title: 'Encrypted Ingest & Capsule Arrival',
                desc: 'Files arrive over mTLS and are loaded exclusively into Intel SGX / AWS Nitro hardware-isolated RAM.',
                badge: 'mTLS Tunnel',
                badgeVariant: 'accent' as const,
              },
              {
                step: '02',
                title: 'AST Decompile & Sheet Extraction',
                desc: 'Volatile memory unrolls the file container, extracting OCR glyphs, embedded fonts, and bytecode streams.',
                badge: 'AST Parser',
                badgeVariant: 'ai' as const,
              },
              {
                step: '03',
                title: '6-Engine Neural Laser Sweep',
                desc: 'High-speed laser sweeps identify prompt injections, PII entities, and hardcoded secrets with 3D beacons.',
                badge: 'AI Sweep',
                badgeVariant: 'threat' as const,
              },
              {
                step: '04',
                title: 'Deterministic Redaction & Merkle Seal',
                desc: 'Threat payloads are masked with irreversible tokens, locked in a zero-trust ring, and Merkle stamped.',
                badge: 'FIPS Proof',
                badgeVariant: 'safe' as const,
              },
            ].map((item) => (
              <Card key={item.step} className="p-4 border-[var(--border)] hover:border-[var(--border-accent)] transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[var(--accent)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded">
                      {item.step}
                    </span>
                    <h4 className="text-xs font-bold text-[var(--text-1)]">{item.title}</h4>
                  </div>
                  <Badge variant={item.badgeVariant} size="sm">
                    {item.badge}
                  </Badge>
                </div>
                <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{item.desc}</p>
              </Card>
            ))}

            <Link to="/scanner" className="block pt-2">
              <Button variant="primary" size="md" className="w-full">
                Launch Full Document Scanner →
              </Button>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

/* ---- Interactive 5-Stage Workflow Pipeline Walkthrough ---- */
const WORKFLOW = [
  { num: '01', label: 'Ingest & Enclave Allocation', desc: 'Received over mTLS and loaded into volatile hardware-isolated TEE RAM (Intel SGX / AWS Nitro).' },
  { num: '02', label: 'Deep Parse & Decompilation', desc: 'Full AST breakdown decoding embedded metadata, OCR text, binary streams, macros, and fonts.' },
  { num: '03', label: '6-Engine Neural Scan', desc: 'Parallel AI models detect prompt injections, PII disclosures, credentials, and forged signatures.' },
  { num: '04', label: 'Dossier & Risk Scoring', desc: 'Generates structured findings with exact page locations, confidence levels, and remediation steps.' },
  { num: '05', label: 'Sanitize & Vault Seal', desc: 'Applies deterministic token redaction, embeds steganographic watermarks, and writes Merkle proof.' },
];

const WorkflowSection: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section className="py-20">
      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionHeader
          eyebrow="Security Pipeline"
          title="From upload to protected in milliseconds."
          description="Click any stage below to inspect the automated zero-trust pipeline executed on every incoming document."
        />

        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Pipeline Step Selector */}
          <div className="lg:col-span-6 space-y-3">
            {WORKFLOW.map((step, i) => {
              const isSelected = activeStep === i;
              return (
                <motion.div
                  key={step.num}
                  whileHover={{ x: 3 }}
                  onClick={() => setActiveStep(i)}
                  className={cn(
                    'p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-start gap-4',
                    isSelected
                      ? 'border-[var(--border-accent)] bg-[var(--surface)] shadow-[var(--shadow-md)]'
                      : 'border-[var(--border)] bg-[var(--surface-alt)] opacity-70 hover:opacity-100'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg font-mono text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors',
                      isSelected
                        ? 'bg-[var(--accent)] text-[#0D1117]'
                        : 'bg-[var(--surface-raised)] text-[var(--text-3)]'
                    )}
                  >
                    {step.num}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-1)] mb-0.5">{step.label}</h3>
                    <p className="text-xs text-[var(--text-2)] leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Active Stage Interactive Telemetry Card */}
          <div className="lg:col-span-6">
            <Card className="p-6 border-[var(--border-accent)]">
              <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
                <span className="text-xs font-mono font-bold uppercase text-[var(--accent)]">
                  Pipeline Telemetry · Stage {WORKFLOW[activeStep].num}
                </span>
                <Badge variant="safe" size="sm">TEE Active</Badge>
              </div>

              <div className="space-y-3 font-mono text-xs mb-5">
                <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-3)] block uppercase mb-1">Execution Enclave</span>
                  <span className="text-[var(--text-1)] font-semibold">{WORKFLOW[activeStep].label}</span>
                </div>

                <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-3)] block uppercase mb-1">Security Guarantee</span>
                  <p className="text-[var(--text-2)] font-sans text-xs leading-relaxed">
                    {WORKFLOW[activeStep].desc}
                  </p>
                </div>
              </div>

              <Link to="/scanner">
                <Button variant="primary" size="sm" className="w-full">
                  Test Live Pipeline in Scanner →
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

const StatsBar: React.FC = () => (
  <div className="py-10 border-y border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-md">
    <Reveal className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-[var(--accent)] font-mono mb-1"><CountUp value={31.8} decimals={1} suffix="M+" /></div>
          <div className="text-xs text-[var(--text-3)] uppercase tracking-wider font-mono">Threats Blocked</div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-[var(--accent)] font-mono mb-1"><CountUp value={140} suffix="+" /></div>
          <div className="text-xs text-[var(--text-3)] uppercase tracking-wider font-mono">PII Entities</div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-[var(--accent)] font-mono mb-1"><CountUp value={2.2} decimals={1} prefix="&lt;" suffix="ms" /></div>
          <div className="text-xs text-[var(--text-3)] uppercase tracking-wider font-mono">Inference Speed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-[var(--accent)] font-mono mb-1"><CountUp value={99.97} decimals={2} suffix="%" /></div>
          <div className="text-xs text-[var(--text-3)] uppercase tracking-wider font-mono">Detection Accuracy</div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-[var(--accent)] font-mono mb-1">SOC 2</div>
          <div className="text-xs text-[var(--text-3)] uppercase tracking-wider font-mono">Type II Certified</div>
        </div>
      </div>
    </Reveal>
  </div>
);

/* ---- CTA Section ---- */
const CTASection: React.FC = () => (
  <section className="py-24">
    <Reveal className="max-w-6xl mx-auto px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-accent)] bg-[var(--surface)]/80 backdrop-blur-xl p-10 sm:p-14 text-center shadow-[var(--shadow-lg)]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,184,169,0.12), transparent)' }}
        />
        <div className="relative z-10">
          <Badge variant="accent" size="md" className="mb-5">
            Zero-Trust Sandbox Ready
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-1)] mb-4 tracking-tight">
            Protect your documents with<br />
            <span className="accent-text">verifiable AI security intelligence.</span>
          </h2>
          <p className="text-sm text-[var(--text-2)] max-w-md mx-auto mb-8 leading-relaxed">
            Upload your first document to decompile, scan, and sanitize in under 2 seconds. No credit card required.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/scanner">
              <Button size="lg" variant="primary">
                Scan Document Free
              </Button>
            </Link>
            <Link to="/enterprise">
              <Button size="lg" variant="secondary">
                Explore Enterprise Architecture
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Reveal>
  </section>
);

/* ---- Footer ---- */
const Footer: React.FC = () => (
  <footer className="border-t border-[var(--border)] py-12 bg-[var(--surface)]/30 backdrop-blur-md">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="grid sm:grid-cols-4 gap-8 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-6 h-6 rounded bg-[var(--accent)] flex items-center justify-center text-[#0D1117]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-[var(--text-1)]">DocShield AI</span>
          </div>
          <p className="text-xs text-[var(--text-3)] leading-relaxed">
            The Living Security Intelligence Platform for enterprise document threat detection and privacy engineering.
          </p>
        </div>

        {[
          {
            title: 'Platform',
            links: [
              { name: 'Document Scanner', to: '/scanner' },
              { name: 'Neural Intelligence', to: '/intelligence' },
              { name: 'Forensics Lab', to: '/analysis' },
              { name: 'Threat Network', to: '/threats' },
            ],
          },
          {
            title: 'Trust & Governance',
            links: [
              { name: 'Security Control Matrix', to: '/security' },
              { name: 'Encrypted Vault', to: '/vault' },
              { name: 'Intelligence Reports', to: '/reports' },
              { name: 'Enterprise VPC', to: '/enterprise' },
            ],
          },
          {
            title: 'Standards',
            links: [
              { name: 'SOC 2 Type II', to: '/security' },
              { name: 'HIPAA Safe Harbor', to: '/security' },
              { name: 'GDPR Article 9', to: '/security' },
              { name: 'FIPS 140-3 HSM', to: '/enterprise' },
            ],
          },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider mb-3 font-mono">
              {col.title}
            </div>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.name}>
                  <Link to={link.to} className="text-xs text-[var(--text-3)] hover:text-[var(--accent)] transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-[var(--border)] flex flex-wrap gap-4 items-center justify-between">
        <div className="text-xs text-[var(--text-3)] font-mono">
          © 2026 DocShield AI, Inc. · Digital Security Operations Center
        </div>
        <div className="flex gap-4 text-[10px] text-[var(--text-3)] font-mono">
          {['SOC2', 'HIPAA', 'GDPR', 'FIPS', 'ISO27001'].map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--safe)]" />
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

export const HomePage: React.FC = () => (
  <div>
    <Hero />
    <StatsBar />
    <FeaturesSection />
    <InteractiveSandboxSection />
    <WorkflowSection />
    <CTASection />
    <Footer />
  </div>
);

export default HomePage;
