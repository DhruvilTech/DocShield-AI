import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card, Badge, SectionHeader, CountUp, Reveal } from '../../components/ui';
import { VerificationAnimation } from '../../components/security';

const TIERS = [
  {
    name: 'Starter',
    price: '$0',
    period: 'forever',
    description: 'For independent security engineers and small dev projects.',
    features: ['50 document scans/month', 'PII & secrets detection', 'Basic threat report', 'Community support'],
    cta: 'Start Free',
    accent: false,
  },
  {
    name: 'Professional',
    price: '$49',
    period: '/month',
    description: 'For growing security teams and mid-market SaaS companies.',
    features: [
      '5,000 document scans/month',
      'All 6 AI security engines',
      'Full threat analysis reports',
      'Forensic steganographic watermarking',
      'REST API & webhooks',
      'Priority 24/7 support',
    ],
    cta: 'Start Free Trial',
    accent: true,
    badge: 'Recommended',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For global enterprises, healthcare, defense, and fintech.',
    features: [
      'Unlimited scans & batch ingest',
      'Dedicated VPC / On-Premise TEE deployment',
      'Custom compliance rule engine & SIEM integration',
      '99.99% uptime SLA with dedicated CSM',
      'SAML SSO, SCIM & RBAC granular roles',
      'Hardware Security Module (HSM) key isolation',
    ],
    cta: 'Talk to Enterprise Sales',
    accent: false,
  },
];

export const EnterprisePage: React.FC = () => {
  const [monthlyDocs, setMonthlyDocs] = useState<number>(25000);

  // Dynamic ROI calculation
  const manualReviewCostPerDoc = 4.50; // $4.50 avg manual compliance check
  const docshieldCostPerDoc = 0.08;
  const monthlySavings = Math.round(monthlyDocs * (manualReviewCostPerDoc - docshieldCostPerDoc));
  const breachRiskAvoidance = Math.round(monthlyDocs * 0.002 * 148000); // 0.2% breach probability * avg incident cost

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <SectionHeader
          eyebrow="Trust Infrastructure"
          title="Enterprise Security Built for Scale."
          description="Hardware-isolated Trusted Execution Environments, FIPS 140-3 HSM key management, and zero-trust document processing for mission-critical workloads."
        />

        {/* Enterprise Architecture Blueprint Visualizer */}
        <Card className="p-6 mb-12 border-[var(--border-accent)]">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
            <div>
              <span className="text-xs font-mono font-bold uppercase text-[var(--accent)] block">
                Deployment Architecture
              </span>
              <span className="text-sm font-bold text-[var(--text-1)]">
                Zero-Trust TEE Enclave Isolation Model
              </span>
            </div>
            <Badge variant="safe" size="sm">FIPS 140-3 Level 3</Badge>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 font-mono text-xs mb-4">
            <div className="p-4 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)]">
              <div className="text-[var(--accent)] font-bold mb-1">01. INGESTION GATEWAY</div>
              <p className="text-[var(--text-2)] text-[11px] font-sans leading-relaxed">
                Documents are received over mTLS, decrypted solely within volatile enclave RAM, and never written to disk unencrypted.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)]">
              <div className="text-[var(--ai)] font-bold mb-1">02. PARALLEL TEE ENCLAVES</div>
              <p className="text-[var(--text-2)] text-[11px] font-sans leading-relaxed">
                Six neural models execute in hardware-isolated memory (Intel SGX / AWS Nitro Enclaves), cryptographically verified by attestation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)]">
              <div className="text-[var(--safe)] font-bold mb-1">03. MERKLE AUDIT TRAIL</div>
              <p className="text-[var(--text-2)] text-[11px] font-sans leading-relaxed">
                Sanitized artifacts receive forensic watermarks and tamper-evident Merkle proofs for direct export to your SIEM/SOC.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-[var(--text-3)] pt-2 border-t border-[var(--border)]">
            <span>SOC 2 TYPE II CERTIFIED</span>
            <span>HIPAA COMPLIANT</span>
            <span>GDPR ART. 9 READY</span>
            <span>ISO 27001 ACCREDITED</span>
          </div>
        </Card>

        {/* Interactive ROI & Risk Savings Calculator */}
        <Card className="p-6 mb-12">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-[var(--border)] pb-4">
            <div>
              <span className="text-xs font-mono font-bold uppercase text-[var(--accent)] block">
                Value Assessment
              </span>
              <h3 className="text-lg font-bold text-[var(--text-1)]">
                Enterprise ROI & Threat Mitigation Estimator
              </h3>
            </div>
            <Badge variant="accent" size="sm">Calculated against manual audit benchmarks</Badge>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono text-[var(--text-2)] mb-2">
                  <span>Monthly Document Volume:</span>
                  <span className="text-sm font-bold text-[var(--accent)]">{monthlyDocs.toLocaleString()} documents</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="200000"
                  step="5000"
                  value={monthlyDocs}
                  onChange={(e) => setMonthlyDocs(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
              </div>

              <div className="text-xs text-[var(--text-2)] leading-relaxed">
                Automating document security with DocShield AI reduces review overhead by 96% and prevents high-consequence compliance breaches.
              </div>
            </div>

            <div className="lg:col-span-6 grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)] text-center">
                <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-1">
                  Estimated Monthly Savings
                </span>
                <div className="text-3xl font-bold font-mono text-[var(--safe)] mb-1">
                  $<CountUp value={monthlySavings} />
                </div>
                <span className="text-[10px] text-[var(--text-3)]">Operational efficiency gain</span>
              </div>

              <div className="p-4 rounded-xl bg-[var(--surface-alt)] border border-[var(--border)] text-center">
                <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-1">
                  Prevented Exposure Risk
                </span>
                <div className="text-3xl font-bold font-mono text-[var(--accent)] mb-1">
                  $<CountUp value={breachRiskAvoidance / 1000000} decimals={1} suffix="M" />
                </div>
                <span className="text-[10px] text-[var(--text-3)]">Regulatory penalty protection</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Pricing Tiers */}
        <div className="grid sm:grid-cols-3 gap-4 mb-16">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card
                className={`p-6 h-full flex flex-col ${
                  tier.accent ? 'border-[var(--border-accent)] shadow-[var(--glow-sm)]' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-base font-bold text-[var(--text-1)] mb-0.5">{tier.name}</div>
                    <div className="text-xs text-[var(--text-2)]">{tier.description}</div>
                  </div>
                  {tier.badge && <Badge variant="accent" size="sm">{tier.badge}</Badge>}
                </div>

                <div className="mb-5">
                  <span className="text-3xl font-bold text-[var(--text-1)] font-mono">{tier.price}</span>
                  <span className="text-sm text-[var(--text-2)] ml-1">{tier.period}</span>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[var(--text-2)]">
                      <svg className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={tier.accent ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full"
                >
                  {tier.cta}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Contact sales CTA Card */}
        <Card className="p-8 text-center border-[var(--border-accent)] bg-[var(--surface)]">
          <h3 className="text-xl font-bold text-[var(--text-1)] mb-2">Need a custom deployment architecture?</h3>
          <p className="text-sm text-[var(--text-2)] mb-5 max-w-md mx-auto">
            Our principal security architects will assist with VPC peering, SIEM integration, and custom compliance mappings for your infrastructure.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button variant="primary" size="md">Schedule Technical Deep Dive</Button>
            <Button variant="secondary" size="md">Download Security Whitepaper</Button>
          </div>
        </Card>
      </Reveal>
    </div>
  );
};

export default EnterprisePage;
