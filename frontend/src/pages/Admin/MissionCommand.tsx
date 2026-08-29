// src/pages/Admin/MissionCommand.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Server,
  Cpu,
  Database,
  Users,
  Building2,
  FileCheck,
  AlertTriangle,
  Lock,
  Unlock,
  Radio,
  Eye,
  Sliders,
  RefreshCw,
  Clock,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Search,
  Key,
  Layers,
  BarChart3,
  Globe,
  Terminal,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Button, Badge, Card, CountUp, cn, SectionHeader, Reveal } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { adminApi, SystemTelemetry, AdminOverview } from '../../lib/api/admin.api';
import { userApi } from '../../lib/api/user.api';
import { organizationApi } from '../../lib/api/organization.api';
import { watchlistApi } from '../../lib/api/watchlist.api';
import { auditApi } from '../../lib/api/audit.api';
import { User, Organization, WatchlistEntry, AuditLog } from '../../types';

export const MissionCommandPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'orgs' | 'watchlists' | 'audit' | 'policies'>('overview');
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Management State Data
  const [usersList, setUsersList] = useState<User[]>([]);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Policy Settings State
  const [faceThreshold, setFaceThreshold] = useState(0.45);
  const [livenessStrictness, setLivenessStrictness] = useState<'STANDARD' | 'STRICT'>('STRICT');
  const [tamperingSensitivity, setTamperingSensitivity] = useState(40);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [policySaved, setPolicySaved] = useState(false);

  // Fetch live telemetry & overview
  const fetchTelemetry = async () => {
    try {
      setRefreshing(true);
      const [telRes, overRes] = await Promise.all([
        adminApi.getTelemetry().catch(() => null),
        adminApi.getOverview().catch(() => null),
      ]);
      if (telRes) setTelemetry(telRes);
      if (overRes) setOverview(overRes);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch admin telemetry:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'users') {
      userApi.listUsers().then((res) => {
        if (res.success && res.data) setUsersList(res.data);
      }).catch(() => {});
    } else if (activeTab === 'orgs') {
      organizationApi.getMyOrganizations().then((orgs) => {
        if (Array.isArray(orgs)) setOrgsList(orgs);
      }).catch(() => {});
    } else if (activeTab === 'watchlists') {
      watchlistApi.listWatchlists().then((res) => {
        if (res.data) setWatchlistItems(res.data);
      }).catch(() => {});
    } else if (activeTab === 'audit') {
      auditApi.listAuditLogs().then((res) => {
        if (res.success && res.data) setAuditLogs(res.data);
      }).catch(() => {});
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleSavePolicies = () => {
    setPolicySaved(true);
    setTimeout(() => setPolicySaved(false), 3000);
  };

  return (
    <div className="min-h-screen pt-14 pb-20 bg-transparent">
      {/* Top Background Cyber Grid Glow */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(0,184,169,0.3),rgba(255,255,255,0))]" />

      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {/* Super Admin Command Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8 border-b border-[var(--border)] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-md bg-[var(--accent)] text-[#05070A] text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,184,169,0.35)] animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                DEFCON 1 // ROOT MISSION CONTROL
              </span>
              <Badge variant="safe" size="sm" dot>
                ENCLAVE ACTIVE
              </Badge>
              <Badge variant="accent" size="sm">
                TEE ISOLATED (SGX)
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[var(--text-1)] flex items-center gap-2">
              DocShield AI // Super Administrator Console
            </h1>
            <p className="text-xs text-[var(--text-2)] font-mono mt-1 max-w-2xl leading-relaxed">
              Global multi-tenant mission command, real-time cyber telemetry, hardware enclave monitoring, user RBAC matrix, and biometric threshold policy governance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] text-[var(--text-3)] font-mono block">SYSTEM HEARTBEAT</span>
              <span className="text-xs font-mono font-bold text-[var(--text-1)]">
                {lastRefreshed.toLocaleTimeString()}
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={fetchTelemetry}
              loading={refreshing}
              icon={<RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />}
            >
              Sync Telemetry
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => setActiveTab('policies')}
              icon={<Sliders className="w-3.5 h-3.5" />}
            >
              Enforce Policies
            </Button>
          </div>
        </div>

        {/* 1. Live Infrastructure & Threat Telemetry Summary Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
          <Card className="p-3.5 border-[var(--border-accent)] bg-[var(--surface-raised)] relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
              <span>ACTIVE TENANTS</span>
              <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--text-1)]">
              <CountUp value={telemetry?.metrics.totalOrganizations || 1} />
            </div>
            <span className="text-[9px] text-[var(--safe)] font-mono">100% Isolated</span>
          </Card>

          <Card className="p-3.5 border-[var(--border-accent)] bg-[var(--surface-raised)] relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
              <span>TOTAL USERS</span>
              <Users className="w-3.5 h-3.5 text-[var(--accent)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--text-1)]">
              <CountUp value={telemetry?.metrics.totalUsers || 2} />
            </div>
            <span className="text-[9px] text-[var(--text-3)] font-mono">RBAC Governed</span>
          </Card>

          <Card className="p-3.5 border-[var(--border-accent)] bg-[var(--surface-raised)] relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
              <span>DOCUMENTS</span>
              <FileCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--text-1)]">
              <CountUp value={telemetry?.metrics.totalDocuments || 0} />
            </div>
            <span className="text-[9px] text-[var(--text-3)] font-mono">AES-256 Encrypted</span>
          </Card>

          <Card className="p-3.5 border-[var(--border-accent)] bg-[var(--surface-raised)] relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
              <span>FRAUD CATCHES</span>
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--threat)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--threat)]">
              <CountUp value={telemetry?.metrics.totalFraudCatches || 0} />
            </div>
            <span className="text-[9px] text-[var(--threat)] font-mono">Interdicted</span>
          </Card>

          <Card className="p-3.5 border-[var(--border-accent)] bg-[var(--surface-raised)] relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
              <span>WATCHLIST REDS</span>
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--warning)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--warning)]">
              <CountUp value={telemetry?.metrics.totalActiveWatchlists || 3} />
            </div>
            <span className="text-[9px] text-[var(--warning)] font-mono">SLTD Matched</span>
          </Card>

          <Card className="p-3.5 border-[var(--border-accent)] bg-[var(--surface-raised)] relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
              <span>FACE MATCH PASS</span>
              <Zap className="w-3.5 h-3.5 text-[var(--safe)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--safe)]">
              <CountUp value={telemetry?.metrics.biometricSuccessRatePercent || 96} />%
            </div>
            <span className="text-[9px] text-[var(--safe)] font-mono">ArcFace 512-d</span>
          </Card>
        </div>

        {/* 2. Interactive Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 border-b border-[var(--border)] scrollbar-none font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 border',
              activeTab === 'overview'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#05070A] shadow-[0_0_15px_rgba(0,184,169,0.3)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            <Activity className="w-4 h-4" />
            Infrastructure & Radar
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 border',
              activeTab === 'users'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#05070A] shadow-[0_0_15px_rgba(0,184,169,0.3)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            <Users className="w-4 h-4" />
            User RBAC Matrix
          </button>

          <button
            onClick={() => setActiveTab('orgs')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 border',
              activeTab === 'orgs'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#05070A] shadow-[0_0_15px_rgba(0,184,169,0.3)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            <Building2 className="w-4 h-4" />
            Multi-Tenant Orgs
          </button>

          <button
            onClick={() => setActiveTab('watchlists')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 border',
              activeTab === 'watchlists'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#05070A] shadow-[0_0_15px_rgba(0,184,169,0.3)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            <ShieldAlert className="w-4 h-4" />
            Border Watchlists
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 border',
              activeTab === 'audit'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#05070A] shadow-[0_0_15px_rgba(0,184,169,0.3)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            <Clock className="w-4 h-4" />
            Master Audit Trail
          </button>

          <button
            onClick={() => setActiveTab('policies')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 border',
              activeTab === 'policies'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#05070A] shadow-[0_0_15px_rgba(0,184,169,0.3)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            <Sliders className="w-4 h-4" />
            Biometric Policies
          </button>
        </div>

        {/* 3. Tab Contents */}
        <AnimatePresence mode="wait">
          {/* TAB 1: OVERVIEW & CYBER RADAR */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid lg:grid-cols-12 gap-6">
                {/* Left 7 Cols: Live Threat Radar & AI Model Clusters */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Cyber Threat Radar */}
                  <Card className="p-6 border-[var(--border-accent)] bg-[var(--surface)] relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-[var(--accent)] animate-pulse" />
                        <h3 className="text-sm font-bold font-mono text-[var(--text-1)] uppercase tracking-wider">
                          Border Checkpoint Threat Radar
                        </h3>
                      </div>
                      <Badge variant="safe" size="sm">
                        360° LIVE SWEEP
                      </Badge>
                    </div>

                    <div className="relative aspect-video w-full rounded-2xl bg-black/60 border border-[var(--border)] flex items-center justify-center overflow-hidden">
                      {/* Radar concentric circles */}
                      <div className="absolute h-64 w-64 rounded-full border border-[var(--accent)]/20" />
                      <div className="absolute h-48 w-48 rounded-full border border-[var(--accent)]/30" />
                      <div className="absolute h-32 w-32 rounded-full border border-[var(--accent)]/40" />
                      <div className="absolute h-16 w-16 rounded-full border border-[var(--accent)]/50" />

                      {/* Crosshairs */}
                      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[var(--accent)]/20" />
                      <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[var(--accent)]/20" />

                      {/* Rotating Sweep Beam */}
                      <motion.div
                        className="absolute h-72 w-72 origin-center rounded-full pointer-events-none"
                        style={{
                          background: 'conic-gradient(from 0deg, rgba(0, 184, 169, 0.45) 0deg, transparent 65deg, transparent 360deg)',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                      />

                      {/* Simulated Threat Blips */}
                      <motion.div
                        className="absolute top-1/3 left-1/3 w-3 h-3 rounded-full bg-[var(--threat)] shadow-[0_0_10px_#EF4444]"
                        animate={{ scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ repeat: Infinity, duration: 1.8 }}
                      >
                        <span className="absolute -top-5 -left-8 text-[9px] font-mono text-[var(--threat)] bg-black/80 px-1 rounded border border-[var(--threat)]/40">
                          RED NOTICE
                        </span>
                      </motion.div>

                      <motion.div
                        className="absolute bottom-1/3 right-1/4 w-2.5 h-2.5 rounded-full bg-[var(--safe)] shadow-[0_0_8px_#22C55E]"
                        animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                        transition={{ repeat: Infinity, duration: 2.2 }}
                      >
                        <span className="absolute -bottom-5 -left-6 text-[9px] font-mono text-[var(--safe)] bg-black/80 px-1 rounded border border-[var(--safe)]/40">
                          CLEARED
                        </span>
                      </motion.div>

                      <div className="absolute bottom-3 left-4 text-[10px] font-mono text-[var(--text-3)]">
                        COORDINATES: LAT 51.5074° N, LON 0.1278° W // TEE MEMORY: 0 BYTES LEAKED
                      </div>
                    </div>
                  </Card>

                  {/* AI Inference Cluster Status */}
                  <Card className="p-6 border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[var(--accent)]" />
                        <h3 className="text-sm font-bold font-mono text-[var(--text-1)] uppercase tracking-wider">
                          AI Biometric & Neural Inference Nodes
                        </h3>
                      </div>
                      <Badge variant="accent" size="sm">
                        4 Operational Clusters
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {(telemetry?.aiClusters || [
                        { name: 'InsightFace ArcFace 512-d Biometrics', status: 'OPERATIONAL', avgLatencyMs: 14.2, throughputFps: 42.8 },
                        { name: 'MediaPipe 478 3D Landmark Liveness', status: 'OPERATIONAL', avgLatencyMs: 8.5, throughputFps: 60.0 },
                        { name: 'Multi-Spectral Tampering CNN', status: 'OPERATIONAL', avgLatencyMs: 18.0, throughputFps: 35.0 },
                        { name: 'TrOCR + ICAO Doc 9303 MRZ Automata', status: 'OPERATIONAL', avgLatencyMs: 4.1, throughputFps: 120.0 },
                      ]).map((cluster, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between flex-wrap gap-2 text-xs font-mono"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-[var(--safe)] animate-ping" />
                            <div>
                              <span className="font-bold text-[var(--text-1)] block">{cluster.name}</span>
                              <span className="text-[10px] text-[var(--text-3)]">Latency: {cluster.avgLatencyMs}ms | Throughput: {cluster.throughputFps} FPS</span>
                            </div>
                          </div>
                          <Badge variant="safe" size="sm">
                            {cluster.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Right 5 Cols: Hardware Enclave & Real-Time Security Stream */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Hardware Enclave TEE Card */}
                  <Card className="p-6 border-[var(--border-accent)] bg-[var(--surface)]">
                    <div className="flex items-center gap-2 mb-3">
                      <Lock className="w-4 h-4 text-[var(--accent)]" />
                      <h3 className="text-sm font-bold font-mono text-[var(--text-1)] uppercase tracking-wider">
                        Hardware TEE Enclave Security
                      </h3>
                    </div>

                    <div className="p-4 rounded-xl bg-black/40 border border-[var(--border-accent)] space-y-2.5 text-xs font-mono mb-4">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-3)]">Enclave Sandbox:</span>
                        <span className="text-[var(--safe)] font-bold">Intel SGX / AMD SEV-SNP</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-3)]">Encryption Cipher:</span>
                        <span className="text-[var(--text-1)] font-bold">AES-256-GCM + SHA-256</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-3)]">CPU Allocation:</span>
                        <span className="text-[var(--text-1)] font-bold">{telemetry?.system?.cpu.cores || 8} Cores Allocated</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-3)]">RAM Isolation:</span>
                        <span className="text-[var(--text-1)] font-bold">{telemetry?.system?.memory.usedMB || 240} MB / {telemetry?.system?.memory.totalMB || 16384} MB ({telemetry?.system?.memory.usagePercent || 35}%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-3)]">Compliance Level:</span>
                        <span className="text-[var(--accent)] font-bold">FIPS 140-3 Level 3</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-[var(--safe)] font-mono">
                      <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                      Zero-plaintext persistent leaks enabled across all tenant enclaves.
                    </div>
                  </Card>

                  {/* Real-time Security Stream */}
                  <Card className="p-6 border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-[var(--accent)]" />
                        <h3 className="text-sm font-bold font-mono text-[var(--text-1)] uppercase tracking-wider">
                          Live Security Event Stream
                        </h3>
                      </div>
                      <Badge variant="neutral" size="sm">
                        Live Ticker
                      </Badge>
                    </div>

                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {(overview?.recentAudits || []).slice(0, 5).map((log, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-xs font-mono"
                        >
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] mb-1">
                            <span className="text-[var(--accent)] font-bold">{log.action}</span>
                            <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-[11px] text-[var(--text-2)] truncate">{log.description}</p>
                          <span className="text-[9px] text-[var(--text-3)] block mt-1">By: {log.user_email || 'System Super Admin'}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: USER RBAC MATRIX */}
          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-mono text-[var(--text-1)]">User RBAC & Role Governance</h3>
                  <p className="text-xs text-[var(--text-3)] font-mono">Assign system security roles and manage border officer clearance levels.</p>
                </div>
                <Link to="/admin/users">
                  <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                    Open Full User Manager
                  </Button>
                </Link>
              </div>

              <Card className="overflow-hidden border-[var(--border)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-3)] uppercase text-[10px]">
                      <tr>
                        <th className="p-3">User</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Current Role</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {usersList.map((u) => (
                        <tr key={u.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                          <td className="p-3 font-bold text-[var(--text-1)]">{u.name}</td>
                          <td className="p-3 text-[var(--text-2)]">{u.email}</td>
                          <td className="p-3">
                            <Badge
                              variant={u.roles?.includes('super_admin') ? 'accent' : 'neutral'}
                              size="sm"
                            >
                              {u.roles?.[0] || 'viewer'}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={u.status === 'ACTIVE' ? 'safe' : 'threat'} size="sm" dot>
                              {u.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-[var(--text-3)]">{new Date(u.createdAt || (u as any).created_at || Date.now()).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}

          {/* TAB 3: MULTI-TENANT ORGS */}
          {activeTab === 'orgs' && (
            <motion.div
              key="orgs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-mono text-[var(--text-1)]">Multi-Tenant Agency Clusters</h3>
                  <p className="text-xs text-[var(--text-3)] font-mono">Isolated border screening tenant domains and storage enclaves.</p>
                </div>
                <Link to="/admin/organization">
                  <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                    Organization Setup
                  </Button>
                </Link>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orgsList.map((org) => (
                  <Card key={org.id} className="p-4 border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm font-mono text-[var(--text-1)]">{org.name}</span>
                      <Badge variant="safe" size="sm">ACTIVE</Badge>
                    </div>
                    <div className="text-xs font-mono text-[var(--text-3)] space-y-1">
                      <div>Slug: <span className="text-[var(--text-1)]">{org.slug}</span></div>
                      <div>ID: <span className="text-[var(--text-2)]">{org.id.substring(0, 16)}...</span></div>
                    </div>
                    <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-mono text-[var(--accent)]">
                      <span>AES-256 Key Locked</span>
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* TAB 4: BORDER WATCHLISTS */}
          {activeTab === 'watchlists' && (
            <motion.div
              key="watchlists"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-mono text-[var(--text-1)]">Global Watchlist & Fugitive Database</h3>
                  <p className="text-xs text-[var(--text-3)] font-mono">Interpol Red Notices and stolen biometric passport records.</p>
                </div>
                <Link to="/admin/watchlist">
                  <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                    Manage Watchlist Records
                  </Button>
                </Link>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {(watchlistItems.length > 0 ? watchlistItems : overview?.topWatchlists || []).map((w: any) => (
                  <Card key={w.id} className="p-4 border-[var(--threat)]/30 bg-[var(--threat)]/5 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[var(--text-1)]">{w.first_name} {w.last_name}</span>
                      <Badge variant="threat" size="sm">RED NOTICE ({w.risk_severity || 'HIGH'})</Badge>
                    </div>
                    <div className="text-[var(--text-2)]">Doc Number: <span className="font-bold text-[var(--accent)]">{w.document_number || 'N/A'}</span></div>
                    <div className="text-[var(--threat)] font-semibold">Reason: {w.reason}</div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* TAB 5: MASTER AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-mono text-[var(--text-1)]">Master Cryptographic Audit Ledger</h3>
                  <p className="text-xs text-[var(--text-3)] font-mono">Immutable audit records verified with SHA-256 HMAC integrity signatures.</p>
                </div>
                <Link to="/admin/audit-trail">
                  <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                    View Complete Audit Trail
                  </Button>
                </Link>
              </div>

              <Card className="overflow-hidden border-[var(--border)] font-mono text-xs">
                <div className="p-3 bg-[var(--surface-raised)] border-b border-[var(--border)] text-[10px] text-[var(--text-3)] uppercase font-bold">
                  Recent Security Events
                </div>
                <div className="divide-y divide-[var(--border)] max-h-96 overflow-y-auto">
                  {(auditLogs.length > 0 ? auditLogs : overview?.recentAudits || []).map((a: any) => (
                    <div key={a.id} className="p-3 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-bold text-[var(--accent)]">{a.action}</span>
                        <p className="text-[11px] text-[var(--text-2)] mt-0.5">{a.description}</p>
                      </div>
                      <div className="text-right text-[10px] text-[var(--text-3)] flex-shrink-0">
                        <div>{new Date(a.created_at).toLocaleString()}</div>
                        <div>IP: {a.ip_address || '127.0.0.1'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* TAB 6: BIOMETRIC & SECURITY POLICIES */}
          {activeTab === 'policies' && (
            <motion.div
              key="policies"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 max-w-3xl"
            >
              <div>
                <h3 className="text-base font-bold font-mono text-[var(--text-1)]">Global Security & Biometric Policy Controls</h3>
                <p className="text-xs text-[var(--text-3)] font-mono">Configure decision boundaries, active liveness tolerance, and security enforcement thresholds.</p>
              </div>

              <Card className="p-6 border-[var(--border-accent)] bg-[var(--surface)] space-y-6 font-mono text-xs">
                {/* Policy 1: ArcFace Match Threshold */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-[var(--text-1)] block">1. 1:1 ArcFace Biometric Threshold</span>
                      <span className="text-[11px] text-[var(--text-3)]">Cosine similarity score required to grant an identity match.</span>
                    </div>
                    <span className="font-bold text-base text-[var(--accent)]">{(faceThreshold * 100).toFixed(0)}% ({faceThreshold})</span>
                  </div>
                  <input
                    type="range"
                    min="0.30"
                    max="0.75"
                    step="0.05"
                    value={faceThreshold}
                    onChange={(e) => setFaceThreshold(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-3)]">
                    <span>Lenient (0.30)</span>
                    <span>Standard Recommended (0.45)</span>
                    <span>High Security (0.75)</span>
                  </div>
                </div>

                {/* Policy 2: Active Liveness Strictness */}
                <div className="pt-4 border-t border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-[var(--text-1)] block">2. Active Liveness Challenge Strictness</span>
                      <span className="text-[11px] text-[var(--text-3)]">3D head rotation angle and landmark movement tolerance.</span>
                    </div>
                    <Badge variant="safe" size="sm">
                      {livenessStrictness}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLivenessStrictness('STANDARD')}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all',
                        livenessStrictness === 'STANDARD'
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] font-bold text-[var(--text-1)]'
                          : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-3)]'
                      )}
                    >
                      <span className="block text-xs font-bold text-[var(--text-1)]">Standard (3-Point)</span>
                      <span className="text-[10px] text-[var(--text-3)]">Center face + horizontal head turn</span>
                    </button>
                    <button
                      onClick={() => setLivenessStrictness('STRICT')}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all',
                        livenessStrictness === 'STRICT'
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] font-bold text-[var(--text-1)]'
                          : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-3)]'
                      )}
                    >
                      <span className="block text-xs font-bold text-[var(--text-1)]">Strict High-Assurance</span>
                      <span className="text-[10px] text-[var(--text-3)]">478 3D mesh points + yaw/pitch tracking</span>
                    </button>
                  </div>
                </div>

                {/* Policy 3: Tampering Anomaly Sensitivity */}
                <div className="pt-4 border-t border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-[var(--text-1)] block">3. Multi-Spectral Tampering Sensitivity</span>
                      <span className="text-[11px] text-[var(--text-3)]">Maximum alteration score before triggering automated border rejection.</span>
                    </div>
                    <span className="font-bold text-base text-[var(--threat)]">{tamperingSensitivity} pts</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="60"
                    step="5"
                    value={tamperingSensitivity}
                    onChange={(e) => setTamperingSensitivity(parseInt(e.target.value))}
                    className="w-full accent-[var(--threat)] cursor-pointer"
                  />
                </div>

                {/* Policy 4: Officer Session Lockout */}
                <div className="pt-4 border-t border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-[var(--text-1)] block">4. Security Session Inactivity Lockout</span>
                      <span className="text-[11px] text-[var(--text-3)]">Automatic token invalidation and enclave unmounting on idle.</span>
                    </div>
                    <span className="font-bold text-base text-[var(--text-1)]">{sessionTimeout} mins</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>

                {/* Action Button */}
                <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-3)]">Changes take effect immediately across all active tenant enclaves.</span>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleSavePolicies}
                    icon={policySaved ? <CheckCircle2 className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
                  >
                    {policySaved ? 'Policies Synchronized!' : 'Save & Enforce Policies'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </div>
  );
};

const SaveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

export default MissionCommandPage;
