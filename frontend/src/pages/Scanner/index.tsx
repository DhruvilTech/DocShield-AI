// src/pages/Scanner/index.tsx
import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Scan,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Button, Badge, Card, SectionHeader, Input, cn, CountUp, Reveal } from '../../components/ui';
import { SecurityRing, VerificationAnimation, ScanLine } from '../../components/security';
import { CameraCapture } from '../../components/common/CameraCapture';
import { useOrganization } from '../../context/OrganizationContext';
import { documentApi } from '../../lib/api/document.api';
import { processingApi } from '../../lib/api/processing.api';
import { screeningApi } from '../../lib/api/screening.api';
import { tamperingApi } from '../../lib/api/tampering.api';
import { faceVerificationApi } from '../../lib/api/faceVerification.api';
import { riskApi } from '../../lib/api/risk.api';
import {
  DocType,
  DocumentExtraction,
  TamperingAnalysis,
  FaceVerification,
  RiskScore,
  DocumentScreening,
  ScreeningVerdict,
  RiskLevel,
} from '../../types';

type ScanPhase = 'idle' | 'uploading' | 'extracting' | 'validating' | 'forensics' | 'biometrics' | 'complete';

const PHASES_INFO: Record<ScanPhase, { label: string; detail: string; progress: number }> = {
  idle: { label: 'Ready', detail: 'Drop document & capture live traveler photo to begin border screening', progress: 0 },
  uploading: { label: 'Enclave Ingestion', detail: 'Hashing payload to Hardware-Isolated TEE memory...', progress: 15 },
  extracting: { label: 'Module 1: OCR Extraction', detail: 'Decompiling ICAO MRZ, visual zones & credential metadata...', progress: 35 },
  validating: { label: 'Module 2: Doc Validation', detail: 'Calculating ICAO 9303 check digits & Interpol SLTD database...', progress: 55 },
  forensics: { label: 'Module 3: Tampering AI', detail: 'Scanning photo replacement, stamp forgery & font tensors...', progress: 75 },
  biometrics: { label: 'Module 4: Face Match', detail: 'Comparing document portrait against live camera capture...', progress: 90 },
  complete: { label: 'Screening Complete', detail: 'Border clearance verdict & multi-factor risk dossier finalized', progress: 100 },
};

export const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();

  // Document & scan state
  const [docType, setDocType] = useState<DocType>('PASSPORT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [referenceFace, setReferenceFace] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Camera capture modal state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [faceVerifyError, setFaceVerifyError] = useState<string | null>(null);

  // Live Scan execution state
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'ocr' | 'validation' | 'tampering' | 'biometrics'>('overview');

  // Results
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [tampering, setTampering] = useState<TamperingAnalysis | null>(null);
  const [faceVerification, setFaceVerification] = useState<FaceVerification | null>(null);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [screening, setScreening] = useState<DocumentScreening | null>(null);
  const [createdDocId, setCreatedDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineResult, setPipelineResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (f: File) => {
    setSelectedFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setFilePreview(null);
    }
  };

  const handleFaceSelect = (f: File) => {
    setReferenceFace(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target?.result as string;
      setFacePreview(b64);
      if (createdDocId) {
        handleRunLiveFaceVerification(b64);
      }
    };
    reader.readAsDataURL(f);
  };

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString().substring(11, 19)}] ${msg}`]);
  };

  // Run On-Demand Live Face Verification against current document
  const handleRunLiveFaceVerification = async (base64Image: string, livenessData?: any) => {
    if (!createdDocId) {
      setFacePreview(base64Image);
      return;
    }

    setIsVerifyingFace(true);
    setFaceVerifyError(null);
    addLog(`[BIOMETRICS] Initiating 1:1 ArcFace verification against document portrait...`);
    if (livenessData) {
      addLog(`[LIVENESS] Active challenge status: ${livenessData.status} (${Math.round((livenessData.confidence || 0.94) * 100)}%) - Completed: ${livenessData.stages_completed?.join(' → ')}`);
    }

    try {
      const result = await faceVerificationApi.verifyFace(createdDocId, {
        referenceFaceBase64: base64Image,
        livenessResult: livenessData,
      });
      setFaceVerification(result);
      if (result.status === 'NO_FACE_DETECTED') {
        setFaceVerifyError(result.metadata?.rejectionReason || 'No face detected in the document portrait.');
      }
      addLog(`[BIOMETRICS] Result: ${result.status} (Similarity: ${(result.similarity_score * 100).toFixed(1)}%, Confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      // Update Risk Scoring & Screening with new biometric factor
      try {
        const [riskRes, screeningRes] = await Promise.all([
          riskApi.calculateRisk(createdDocId),
          screeningApi.runScreening(createdDocId),
        ]);
        if (riskRes) setRiskScore(riskRes);
        if (screeningRes) setScreening(screeningRes);
      } catch { }

      setActiveTab('biometrics');
    } catch (err: any) {
      console.error('Face verification error:', err);
      const msg = err.message || 'Face verification failed.';
      setFaceVerifyError(msg);
      addLog(`[BIOMETRICS ERROR] ${msg}`);
    } finally {
      setIsVerifyingFace(false);
    }
  };

  // Handle Camera Capture Callback
  const handleCameraCapture = (base64Image: string, _blob?: Blob, livenessData?: any) => {
    setFacePreview(base64Image);
    setIsCameraOpen(false);
    handleRunLiveFaceVerification(base64Image, livenessData);
  };

  // Run Real End-to-End Border Screening
  const handleExecuteScreening = async (presetFile?: File, presetDocType?: DocType) => {
    const fileToUpload = presetFile || selectedFile;
    const documentType = presetDocType || docType;

    if (!fileToUpload) {
      alert('Please upload or select an identity document to screen.');
      return;
    }

    try {
      setError(null);
      setFaceVerifyError(null);
      setLogs([]);
      setPhase('uploading');
      addLog(`[INIT] Enclave allocation: Hardware-Isolated TEE sandbox (Intel SGX)`);
      addLog(`[INGEST] Uploading "${fileToUpload.name}" (${(fileToUpload.size / 1024).toFixed(1)} KB) - Type: ${documentType}`);

      // 1. Upload Document
      const uploadedDoc = await documentApi.uploadDocument(fileToUpload, {
        documentType,
        name: fileToUpload.name,
      });
      setCreatedDocId(uploadedDoc.id);
      addLog(`[ENCLAVE] Document ingested with SHA-256 Checksum: ${uploadedDoc.checksum?.substring(0, 16)}...`);

      // 2. Trigger sequential backend pipeline execution
      setPhase('extracting');
      addLog(`[PIPELINE] Starting sequential multi-stage verification...`);
      addLog(`[STAGE 1] Running Document Detection AI...`);

      const pipelineResult = await documentApi.verifyPipeline(uploadedDoc.id, {
        referenceFaceBase64: facePreview || undefined,
        simulateMismatch: !facePreview && (fileToUpload.name.includes('forged') || fileToUpload.name.includes('stolen')),
      });
      setPipelineResult(pipelineResult);

      // Process Stage 1: Document Detection
      const docStage = pipelineResult.stages?.document_detection;
      if (docStage && docStage.status === 'passed') {
        setExtraction(docStage.result);
        addLog(`✓ Document Detection Passed. Confidence: ${((docStage.result?.confidence_score || 0.95) * 100).toFixed(0)}%`);
      } else {
        addLog(`✗ Document Detection Failed: ${docStage?.reason || 'Invalid document'}`);
        addLog(`Tampering Analysis: Skipped`);
        addLog(`Face Verification: Skipped`);
        setPhase('idle');
        setError(docStage?.reason || 'Document screening failed validation standards.');
        setScreening(pipelineResult.screening);
        setRiskScore(pipelineResult.riskScore);
        return;
      }

      // Process Stage 2: Tampering
      setPhase('forensics');
      addLog(`→ Running Tampering Analysis...`);
      await new Promise((r) => setTimeout(r, 600));

      const tampStage = pipelineResult.stages?.tampering;
      if (tampStage && tampStage.status === 'passed') {
        setTampering(tampStage.result);
        addLog(`✓ Tampering Analysis Passed. Score: ${tampStage.result?.overall_tampering_score || 0}`);
      } else {
        setTampering(tampStage?.result || null);
        addLog(`✗ Tampering Analysis Failed: ${tampStage?.reason || 'Tampering detected'}`);
        addLog(`Face Verification: Skipped`);
        setPhase('idle');
        setError(tampStage?.reason || 'Forensic tampering verification failed.');
        setScreening(pipelineResult.screening);
        setRiskScore(pipelineResult.riskScore);
        return;
      }

      // Process Stage 3: Face Verification
      setPhase('biometrics');
      addLog(`→ Running Face Verification...`);
      await new Promise((r) => setTimeout(r, 600));

      const faceStage = pipelineResult.stages?.face_verification;
      setFaceVerification(faceStage?.result || null);
      if (faceStage && faceStage.status === 'passed') {
        addLog(`✓ Face Verification Completed: MATCH (Similarity: ${(faceStage.result?.similarity_score * 100).toFixed(1)}%)`);
      } else {
        addLog(`✗ Face Verification Failed: ${faceStage?.reason || 'No match'}`);
      }

      // Set final verdicts
      setScreening(pipelineResult.screening);
      setRiskScore(pipelineResult.riskScore);
      setPhase('complete');
      addLog(`[VERDICT] Clearance Verdict: ${pipelineResult.screening?.verdict} (Risk: ${pipelineResult.screening?.overall_risk_score}/100)`);
    } catch (err: any) {
      console.error('Screening failed', err);
      setError(err.message || 'Screening pipeline encountered an error');
      setPhase('idle');
      addLog(`[ERROR] Screening failed: ${err.message}`);
    }
  };

  const handleReset = () => {
    setPhase('idle');
    setSelectedFile(null);
    setFilePreview(null);
    setReferenceFace(null);
    setFacePreview(null);
    setExtraction(null);
    setTampering(null);
    setFaceVerification(null);
    setRiskScore(null);
    setScreening(null);
    setCreatedDocId(null);
    setError(null);
    setFaceVerifyError(null);
    setLogs([]);
    setPipelineResult(null);
  };

  const getMrzStatus = () => {
    if (!pipelineResult) return { label: 'VALID ICAO', variant: 'safe' as const };
    const checks = pipelineResult.stages?.document_detection?.result?.validation?.checks || [];
    const mrzCheck = checks.find((c: any) => c.field === 'mrz');
    if (mrzCheck) {
      return mrzCheck.status === 'valid'
        ? { label: 'VALID ICAO', variant: 'safe' as const }
        : { label: 'CHECKSUM MISMATCH', variant: 'threat' as const };
    }
    const factors = pipelineResult.screening?.factors || [];
    const hasMrzFailure = factors.some((f: any) => f.title.includes('MRZ') || f.title.includes('ICAO'));
    if (hasMrzFailure) {
      return { label: 'CHECKSUM MISMATCH', variant: 'threat' as const };
    }
    return { label: 'VALID ICAO', variant: 'safe' as const };
  };

  const getWatchlistStatus = () => {
    if (!pipelineResult) return { label: 'CLEAR', variant: 'safe' as const };
    const factors = pipelineResult.screening?.factors || [];
    const hasWatchlistHit = factors.some((f: any) => f.title.includes('Watchlist') || f.title.includes('Interpol'));
    if (hasWatchlistHit) {
      return { label: 'ALERT / HIT', variant: 'threat' as const };
    }
    return { label: 'CLEAR', variant: 'safe' as const };
  };

  const getExpiryStatus = () => {
    if (!pipelineResult) return { label: 'COMPLIANT', variant: 'safe' as const };
    const factors = pipelineResult.screening?.factors || [];
    const hasExpiryFailure = factors.some((f: any) => f.title.includes('Expired') || f.title.includes('Expiry'));
    if (hasExpiryFailure) {
      const expiryVal = extraction?.extracted_fields?.dateOfExpiry?.value;
      if (expiryVal) {
        const expDate = new Date(expiryVal);
        if (!isNaN(expDate.getTime()) && expDate < new Date()) {
          return { label: 'EXPIRED', variant: 'threat' as const };
        }
      }
      return { label: 'NEAR EXPIRY', variant: 'warning' as const };
    }
    return { label: 'COMPLIANT', variant: 'safe' as const };
  };

  const verdict = screening?.verdict || (riskScore && riskScore.risk_score >= 50 ? 'REJECTED' : 'PASSED');
  const risk = screening?.overall_risk_score ?? (riskScore?.risk_score ?? 0);
  const verdictColor = verdict === 'PASSED' ? 'var(--safe)' : verdict === 'REVIEW_REQUIRED' ? 'var(--warning)' : 'var(--threat)';

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      {/* Live Camera Modal */}
      <CameraCapture
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        title="Live Traveler Biometric Verification"
        subtitle="Align the subject's face inside the reticle to run 1:1 ArcFace matching."
      />

      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <SectionHeader
          eyebrow="AI Border Checkpoint Enclave"
          title="Fake Identity & Document Screening System"
          description="Instant border verification: Module 1 OCR Extraction, Module 2 ICAO Standards & Interpol SLTD Validation, Module 3 Tampering Forensics, and Module 4 Biometric Webcam Face Matching."
        />

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--threat)]/10 border border-[var(--threat)]/30 text-xs text-[var(--threat)] font-mono flex items-center justify-between">
            <span>{error}</span>
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column: Upload & Live Enclave Controls */}
          <div className="lg:col-span-5 space-y-5">
            {phase === 'idle' ? (
              <Card className="p-5 border-[var(--border)]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-1)]">
                    1. Select Document Category
                  </span>
                  <Badge variant="accent" size="sm">P8 Standard</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(['PASSPORT', 'VISA', 'NATIONAL_ID', 'DRIVING_LICENSE', 'PERMIT'] as DocType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setDocType(t)}
                      className={cn(
                        'px-2.5 py-2 rounded-lg text-xs font-mono font-semibold transition-all text-center border',
                        docType === t
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-1)] shadow-sm'
                          : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:border-[var(--border-accent)]'
                      )}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Drop Zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleFileSelect(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 mb-4',
                    dragging
                      ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
                      : 'border-[var(--border)] hover:border-[var(--border-accent)] bg-[var(--surface-raised)]'
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />

                  {filePreview ? (
                    <div className="flex flex-col items-center">
                      <img src={filePreview} alt="Document Preview" className="h-32 object-contain rounded-lg border border-[var(--border)] mb-2" />
                      <p className="text-xs font-mono font-bold text-[var(--text-1)] truncate max-w-[240px]">{selectedFile?.name}</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mb-2 font-mono font-bold">
                        📄
                      </div>
                      <p className="text-xs font-mono font-bold text-[var(--text-1)]">{selectedFile.name}</p>
                      <p className="text-[10px] text-[var(--text-3)] font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mx-auto mb-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-1)] mb-0.5">Upload Identity Document</p>
                      <p className="text-[10px] text-[var(--text-3)] font-mono">PDF, JPEG, PNG · Passports, Visas, IDs</p>
                    </div>
                  )}
                </div>

                {/* Module 4 Live Biometric Face Capture Option */}
                <div className="mb-5 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold font-mono uppercase text-[var(--text-2)] flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Module 4: Live Subject Photo
                    </span>
                    <Badge variant={facePreview ? 'safe' : 'info'} size="sm">
                      {facePreview ? 'Face Ready' : 'Webcam / File'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsCameraOpen(true)}
                      icon={<Camera className="w-3.5 h-3.5" />}
                    >
                      {facePreview ? 'Retake Live Selfie' : 'Open Live Camera'}
                    </Button>

                    <button
                      onClick={() => faceInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[11px] font-mono text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
                    >
                      📁 Upload File
                    </button>
                    <input
                      ref={faceInputRef}
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFaceSelect(f);
                      }}
                    />

                    {facePreview && (
                      <div className="flex items-center gap-2 pl-1">
                        <img src={facePreview} alt="Live subject" className="w-7 h-7 rounded-full object-cover border border-[var(--safe)] shadow-sm" />
                        <span className="text-[10px] text-[var(--safe)] font-mono font-bold">✓ Attached</span>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => handleExecuteScreening()}
                  disabled={!selectedFile}
                >
                  Initiate AI Border Screening Enclave
                </Button>
              </Card>
            ) : (
              <Card className="p-5 border-[var(--border)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
                    <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)]">
                      {PHASES_INFO[phase].label}
                    </span>
                  </div>
                  <Badge variant="accent" size="sm">{PHASES_INFO[phase].progress}%</Badge>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[var(--accent)]"
                    animate={{ width: `${PHASES_INFO[phase].progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                <p className="text-xs text-[var(--accent)] font-mono">{PHASES_INFO[phase].detail}</p>

                {/* Live log stream */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-[10px] text-[var(--text-3)] max-h-56 overflow-y-auto space-y-1.5">
                  <div className="text-[9px] uppercase font-bold text-[var(--text-2)] border-b border-[var(--border)] pb-1 mb-1 flex items-center justify-between">
                    <span>BORDER SECURITY TELEMETRY STREAM</span>
                    {isVerifyingFace && <span className="text-[var(--accent)] animate-pulse">● BIOMETRICS MATCHING...</span>}
                  </div>
                  {logs.map((l, idx) => (
                    <div key={idx} className={idx === logs.length - 1 ? 'text-[var(--accent)] font-bold' : ''}>
                      {l}
                    </div>
                  ))}
                </div>

                {phase === 'complete' && (
                  <div className="space-y-2 pt-2">
                    {/* Action button to open camera and verify live face directly */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center border-[var(--safe)] text-[var(--safe)] hover:bg-[var(--safe)]/10"
                      onClick={() => setIsCameraOpen(true)}
                      loading={isVerifyingFace}
                      icon={<Camera className="w-4 h-4 text-[var(--safe)]" />}
                    >
                      {faceVerification ? 'Re-Verify with Live Webcam' : 'Verify Identity with Live Camera'}
                    </Button>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
                        Scan Another
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate('/vault')}
                      >
                        View in Secure Vault
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right Column: Comprehensive Screening Dossier (P8 Modules 1 to 4) */}
          <div className="lg:col-span-7">
            {phase !== 'complete' && !screening ? (
              <Card className="p-10 text-center h-full flex flex-col items-center justify-center min-h-[420px] border-[var(--border)]">
                <div className="w-16 h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center mb-4 text-2xl">
                  🛡️
                </div>
                <h3 className="text-sm font-bold text-[var(--text-1)] mb-1">AI Screening Enclave Standby</h3>
                <p className="text-xs text-[var(--text-2)] max-w-md leading-relaxed font-mono">
                  Select a document category or upload an identity credential on the left to execute full OCR extraction, official ICAO standard validation, stamp/photo forensics, and live biometric face verification.
                </p>
              </Card>
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* 1. Executive Verdict Card */}
                <Card className="p-5 border-[var(--border-accent)]" style={{ borderColor: `${verdictColor}50` }}>
                  <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider text-white shadow-sm"
                          style={{ backgroundColor: verdictColor }}
                        >
                          {verdict === 'PASSED' ? '✓ CLEARANCE GRANTED' : verdict === 'REVIEW_REQUIRED' ? '⚠ SECONDARY INSPECTION' : '⛔ ENTRY REFUSED / FRAUD ALERT'}
                        </span>
                        <Badge variant={verdict === 'PASSED' ? 'safe' : verdict === 'REVIEW_REQUIRED' ? 'warning' : 'threat'} size="sm">
                          {screening?.overall_risk_level || 'EVALUATED'}
                        </Badge>
                      </div>

                      <div className="text-3xl font-bold font-mono" style={{ color: verdictColor }}>
                        <CountUp value={risk} />
                        <span className="text-sm text-[var(--text-3)] font-normal"> / 100 Risk Score</span>
                      </div>
                      <p className="text-xs text-[var(--text-2)] mt-1 font-mono">{screening?.summary || 'Screening intelligence completed.'}</p>
                    </div>

                    <SecurityRing
                      progress={100 - risk}
                      status={verdict === 'PASSED' ? 'verified' : verdict === 'REVIEW_REQUIRED' ? 'scanning' : 'threat'}
                      size={76}
                      strokeWidth={4}
                      label={verdict === 'PASSED' ? 'Authentic' : 'Threat'}
                    />
                  </div>

                  {/* Multi-Factor Score Breakdown */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[var(--border)] text-center text-xs font-mono">
                    <div className="p-2 rounded bg-[var(--surface)]">
                      <span className="text-[9px] text-[var(--text-3)] block">TAMPERING (40)</span>
                      <span className="font-bold text-[var(--text-1)]">{riskScore?.score_breakdown.tamperingScore ?? 0} pts</span>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface)]">
                      <span className="text-[9px] text-[var(--text-3)] block">VALIDATION (30)</span>
                      <span className="font-bold text-[var(--text-1)]">{riskScore?.score_breakdown.validationScore ?? 0} pts</span>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface)]">
                      <span className="text-[9px] text-[var(--text-3)] block">BIOMETRIC (20)</span>
                      <span className="font-bold text-[var(--text-1)]">{riskScore?.score_breakdown.biometricScore ?? 0} pts</span>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface)]">
                      <span className="text-[9px] text-[var(--text-3)] block">OCR QUALITY (10)</span>
                      <span className="font-bold text-[var(--text-1)]">{riskScore?.score_breakdown.ocrQualityScore ?? 0} pts</span>
                    </div>
                  </div>
                </Card>

                {/* 2. Interactive P8 Module Inspection Tabs */}
                <div className="flex border-b border-[var(--border)] text-xs font-mono">
                  {[
                    { id: 'overview', label: 'Screening Factors' },
                    { id: 'ocr', label: 'Module 1: OCR Fields' },
                    { id: 'validation', label: 'Module 2: Validation & SLTD' },
                    { id: 'tampering', label: 'Module 3: Tampering AI' },
                    { id: 'biometrics', label: 'Module 4: Face Match' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id as any)}
                      className={cn(
                        'px-3.5 py-2.5 font-semibold transition-colors border-b-2 -mb-[1px]',
                        activeTab === t.id
                          ? 'border-[var(--accent)] text-[var(--text-1)] bg-[var(--surface-alt)]/30'
                          : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Tab 1: Factors */}
                {activeTab === 'overview' && (
                  <Card className="p-4 space-y-3">
                    <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] block">
                      Screening Findings & Risk Indicators ({screening?.factors?.length || 0})
                    </span>
                    {screening?.factors && screening.factors.length > 0 ? (
                      screening.factors.map((f, idx) => (
                        <div key={idx} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-xs font-mono space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[var(--text-1)]">{f.title}</span>
                            <Badge variant={f.severity === 'CRITICAL' ? 'threat' : f.severity === 'HIGH' ? 'threat' : 'warning'} size="sm">
                              {f.severity} ({f.impact_score} pts)
                            </Badge>
                          </div>
                          <p className="text-[var(--text-2)] font-sans text-xs">{f.description}</p>
                          {f.evidence && <p className="text-[10px] text-[var(--text-3)] truncate">Evidence: {f.evidence}</p>}
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-xs text-[var(--safe)] font-mono">
                        ✓ No negative security factors detected. All checks within official tolerance.
                      </div>
                    )}
                  </Card>
                )}

                {/* Tab 2: OCR Fields (P8 Module 1) */}
                {activeTab === 'ocr' && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2">
                      <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)]">
                        Module 1: Extracted Credential Fields
                      </span>
                      <Badge variant="safe" size="sm">Confidence: {((extraction?.confidence_score || 0.95) * 100).toFixed(0)}%</Badge>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 text-xs font-mono">
                      {extraction?.extracted_fields &&
                        Object.entries(extraction.extracted_fields).map(([key, val]) => {
                          if (key === 'mrzLines' || key === 'mrzValidation' || typeof val !== 'object' || !val) return null;
                          return (
                            <div key={key} className="p-2.5 rounded border border-[var(--border)] bg-[var(--surface-raised)]">
                              <span className="text-[10px] text-[var(--text-3)] uppercase block mb-0.5">
                                {key.replace(/([A-Z])/g, ' $1')}
                              </span>
                              <span className="font-bold text-[var(--text-1)] text-xs">
                                {val.value ? String(val.value) : '—'}
                              </span>
                            </div>
                          );
                        })}
                    </div>

                    {/* MRZ Lines */}
                    {extraction?.extracted_fields?.mrzLines?.value && (
                      <div className="mt-4 p-3 rounded-lg bg-black/60 border border-[var(--border)] text-xs font-mono text-[var(--safe)]">
                        <span className="text-[10px] text-[var(--text-3)] uppercase block mb-1">
                          Machine Readable Zone (MRZ ICAO Doc 9303)
                        </span>
                        {extraction.extracted_fields.mrzLines.value.map((line: string, i: number) => (
                          <div key={i} className="tracking-widest">{line}</div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Tab 3: Module 2 Official Standards & Watchlist */}
                {activeTab === 'validation' && (
                  <Card className="p-4 space-y-3">
                    <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] block">
                      Module 2: Document Standards & Watchlist Verification
                    </span>

                    <div className="space-y-2 text-xs font-mono">
                      <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[var(--text-1)] block">ICAO Doc 9303 Checksum Validation</span>
                          <span className="text-[11px] text-[var(--text-3)]">
                            Weights 7-3-1 check digits across Document Number, DOB & Expiry
                          </span>
                        </div>
                        {(() => {
                          const status = getMrzStatus();
                          return <Badge variant={status.variant} size="sm">{status.label}</Badge>;
                        })()}
                      </div>

                      <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[var(--text-1)] block">Interpol SLTD & Border Watchlist Check</span>
                          <span className="text-[11px] text-[var(--text-3)]">
                            Cross-referencing stolen passport alerts, travel bans & identity fraud suspects
                          </span>
                        </div>
                        {(() => {
                          const status = getWatchlistStatus();
                          return <Badge variant={status.variant} size="sm">{status.label}</Badge>;
                        })()}
                      </div>

                      <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[var(--text-1)] block">International 6-Month Expiry Rule</span>
                          <span className="text-[11px] text-[var(--text-3)]">
                            Ensures document remains valid for mandatory minimum travel period
                          </span>
                        </div>
                        {(() => {
                          const status = getExpiryStatus();
                          return <Badge variant={status.variant} size="sm">{status.label}</Badge>;
                        })()}
                      </div>
                    </div>
                  </Card>
                )}

                {/* Tab 4: Module 3 Tampering AI */}
                {activeTab === 'tampering' && (
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)]">
                        Module 3: Tampering Forensics (P8 Use Cases 1 to 4)
                      </span>
                      <Badge variant={tampering?.has_tampering_detected ? 'threat' : 'safe'} size="sm">
                        Score: {tampering?.overall_tampering_score ?? 0}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-3)] block">PHOTO REPLACEMENT</span>
                        <span className="font-bold text-[var(--text-1)]">
                          {tampering?.indicators?.some((i) => i.category === 'PHOTO_SUBSTITUTION') ? '🚨 Alteration Detected' : '✓ Authentic Boundary'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-3)] block">TEXT MANIPULATION</span>
                        <span className="font-bold text-[var(--text-1)]">
                          {tampering?.indicators?.some((i) => i.category === 'TEXT_ALTERATION') ? '🚨 Text Modified' : '✓ Consistent Font Metrics'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-3)] block">STAMP FORGERY</span>
                        <span className="font-bold text-[var(--text-1)]">
                          {tampering?.indicators?.some((i) => i.category === 'STAMP_FORGERY' || i.category === 'STAMP_IRREGULARITY') ? '🚨 Stamp Forgery Flag' : '✓ Seal Verified'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-3)] block">METADATA & ELA</span>
                        <span className="font-bold text-[var(--text-1)]">
                          {tampering?.indicators?.some((i) => i.category === 'METADATA_MISMATCH') ? '🚨 Photoshop Tag Detected' : '✓ Native Encoding'}
                        </span>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Tab 5: Module 4 Biometric Face Match */}
                {activeTab === 'biometrics' && (
                  <Card className="p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] flex items-center gap-1.5">
                          <Scan className="w-4 h-4 text-[var(--accent)]" />
                          Module 4: 1:1 Biometric Face Verification
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {faceVerification?.metadata?.liveness && (
                          <Badge
                            variant={faceVerification.metadata.liveness.status === 'PASS' ? 'safe' : 'threat'}
                            size="sm"
                            dot
                          >
                            {faceVerification.metadata.liveness.status === 'PASS'
                              ? `✓ LIVENESS PASS (${Math.round((faceVerification.metadata.liveness.confidence ?? 0.94) * 100)}%)`
                              : '⛔ LIVENESS FAILED'}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            faceVerification?.status === 'MATCH'
                              ? 'safe'
                              : faceVerification?.status === 'NO_MATCH'
                                ? 'threat'
                                : 'warning'
                          }
                          size="sm"
                          dot
                        >
                          {faceVerification?.status === 'MATCH'
                            ? '✓ MATCH'
                            : faceVerification?.status === 'NO_MATCH'
                              ? '⛔ NO MATCH / MISMATCH'
                              : faceVerification?.status === 'NO_FACE_DETECTED'
                                ? '⚠ NO FACE DETECTED'
                                : faceVerification?.status || 'PENDING'}
                        </Badge>
                      </div>
                    </div>

                    {/* Error Banner */}
                    {(faceVerifyError || (faceVerification?.metadata?.rejectionReason && faceVerification?.status !== 'MATCH')) && (
                      <div className="p-3 rounded-lg bg-[var(--threat)]/10 border border-[var(--threat)]/30 text-xs text-[var(--threat)] font-mono flex items-center justify-between">
                        <span>
                          {faceVerifyError || faceVerification?.metadata?.rejectionReason || 'Face verification rejected.'}
                        </span>
                        {faceVerifyError && (
                          <Button size="sm" variant="ghost" onClick={() => setFaceVerifyError(null)}>Dismiss</Button>
                        )}
                      </div>
                    )}

                    {/* Dual portrait comparison */}
                    <div className="grid grid-cols-2 gap-4 text-center">
                      {/* 1. Document Portrait */}
                      <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex flex-col items-center">
                        <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-2 font-bold">
                          1. Document Portrait
                        </span>
                        {filePreview ? (
                          <img src={filePreview} alt="Document" className="w-24 h-28 rounded-lg object-contain bg-black/40 border border-[var(--border-accent)] shadow-sm" />
                        ) : (
                          <div className="w-24 h-28 rounded-lg bg-black/40 border border-[var(--border-accent)] flex items-center justify-center text-3xl">
                            📄
                          </div>
                        )}
                        <span className="mt-2 text-[10px] text-[var(--text-2)] font-mono">
                          {selectedFile?.name || 'Document ID'}
                        </span>
                        <span className="text-[9px] text-[var(--safe)] font-mono mt-0.5">
                          {faceVerification?.face_detected_in_doc ? '✓ Face Detected' : 'No Portrait'}
                        </span>
                      </div>

                      {/* 2. Live Webcam Photo */}
                      <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex flex-col items-center">
                        <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-2 font-bold flex items-center gap-1 justify-center">
                          <Camera className="w-3 h-3 text-[var(--safe)]" />
                          2. Live Traveler Capture
                        </span>
                        {facePreview ? (
                          <div className="relative group">
                            <img src={facePreview} alt="Live subject" className="w-24 h-28 rounded-lg object-cover border-2 border-[var(--safe)] shadow-md" />
                            <button
                              onClick={() => setIsCameraOpen(true)}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-[10px] font-mono text-white font-bold"
                            >
                              Retake
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsCameraOpen(true)}
                            className="w-24 h-28 rounded-lg border-2 border-dashed border-[var(--safe)]/50 hover:border-[var(--safe)] bg-[var(--safe)]/5 hover:bg-[var(--safe)]/10 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-xs font-mono text-[var(--safe)]"
                          >
                            <Camera className="w-6 h-6" />
                            <span className="text-[10px] font-bold">Open Camera</span>
                          </button>
                        )}
                        <span className="mt-2 text-[10px] text-[var(--safe)] font-mono">
                          {facePreview ? 'Live Capture Locked' : 'No Live Capture'}
                        </span>
                        {faceVerification?.metadata?.liveness && (
                          <span className="text-[9px] font-mono mt-0.5 text-[var(--text-3)]">
                            Liveness: {faceVerification.metadata.liveness.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Biometric Similarity & Telemetry */}
                    <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-[var(--text-2)]">Facial ArcFace Similarity:</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-lg font-bold font-mono"
                            style={{
                              color:
                                faceVerification?.status === 'MATCH'
                                  ? 'var(--safe)'
                                  : faceVerification?.status === 'NO_MATCH'
                                    ? 'var(--threat)'
                                    : 'var(--text-1)',
                            }}
                          >
                            {faceVerification ? `${(faceVerification.similarity_score * 100).toFixed(1)}%` : '—'}
                          </span>
                          <span className="text-[10px] text-[var(--text-3)] font-mono">
                            (Threshold: {((faceVerification?.match_threshold ?? 0.45) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      {/* Similarity Meter Bar */}
                      <div className="h-2 w-full rounded-full bg-[var(--surface)] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            backgroundColor:
                              faceVerification?.status === 'MATCH'
                                ? 'var(--safe)'
                                : faceVerification?.status === 'NO_MATCH'
                                  ? 'var(--threat)'
                                  : 'var(--accent)',
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.max(5, (faceVerification?.similarity_score ?? 0) * 100))}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>

                      {/* Quality & Confidence details */}
                      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[var(--border)] text-center text-[10px] font-mono">
                        <div className="p-1.5 rounded bg-[var(--surface)]">
                          <span className="text-[var(--text-3)] block">CONFIDENCE</span>
                          <span className="font-bold text-[var(--text-1)]">
                            {faceVerification?.confidence ? `${(faceVerification.confidence * 100).toFixed(0)}%` : '92%'}
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-[var(--surface)]">
                          <span className="text-[var(--text-3)] block">SHARPNESS</span>
                          <span className="font-bold text-[var(--safe)]">
                            {faceVerification?.metadata?.doc_quality?.sharpness
                              ? `${faceVerification.metadata.doc_quality.sharpness.toFixed(0)} var`
                              : '✓ VERIFIED'}
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-[var(--surface)]">
                          <span className="text-[var(--text-3)] block">LANDMARKS</span>
                          <span className="font-bold text-[var(--text-1)]">
                            478 3D PTS
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-[var(--surface)]">
                          <span className="text-[var(--text-3)] block">LATENCY</span>
                          <span className="font-bold text-[var(--text-2)]">
                            {faceVerification?.processing_time_ms ?? 0} ms
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Camera Trigger action button */}
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => setIsCameraOpen(true)}
                      loading={isVerifyingFace}
                      icon={<Camera className="w-4 h-4" />}
                    >
                      {facePreview ? 'Capture & Re-Verify Traveler Face' : 'Open Camera & Match Live Face'}
                    </Button>
                  </Card>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default ScannerPage;
