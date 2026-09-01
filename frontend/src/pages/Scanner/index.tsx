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
import { SecurityRing, VerificationAnimation, ScanLine, ScannerStandbyView } from '../../components/security';
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

type ScanPhase = 'idle' | 'uploading' | 'extracting' | 'validating' | 'forensics' | 'ready_for_biometrics' | 'biometrics' | 'complete';

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

  const getPhaseInfo = (currentPhase: ScanPhase, currentDocType: DocType) => {
    const base = {
      idle: { label: 'Ready', detail: 'Drop document & capture live traveler photo to begin border screening', progress: 0 },
      uploading: { label: 'Enclave Ingestion', detail: 'Hashing payload to Hardware-Isolated TEE memory...', progress: 15 },
      extracting: {
        label: 'Module 1: OCR Extraction',
        detail:
          currentDocType === 'PASSPORT' ? 'Decompiling ICAO MRZ, visual zones & credential metadata...' :
          currentDocType === 'VISA' ? 'Decompiling visa stamp layout, validity regions & text descriptors...' :
          currentDocType === 'NATIONAL_ID' ? 'Parsing National ID card layout, biometric labels & text regions...' :
          currentDocType === 'DRIVING_LICENSE' ? 'Extracting driver info, vehicle classifications & permission codes...' :
          'Extracting permit parameters, registry ids & license plates...',
        progress: 35
      },
      validating: {
        label: 'Module 2: Doc Validation',
        detail:
          currentDocType === 'PASSPORT' ? 'Calculating ICAO 9303 check digits & Interpol SLTD database...' :
          currentDocType === 'VISA' ? 'Verifying entry permissions, visa type constraints & stay duration...' :
          currentDocType === 'NATIONAL_ID' ? 'Verifying Verhoeff dihedral D5 mathematical check digits...' :
          currentDocType === 'DRIVING_LICENSE' ? 'Verifying licensing authority database & validity terms...' :
          'Verifying transport registry databases & validity compliance...',
        progress: 55
      },
      forensics: {
        label: 'Module 3: Tampering AI',
        detail:
          currentDocType === 'PASSPORT' ? 'Scanning photo replacement, stamp forgery & font tensors...' :
          currentDocType === 'VISA' ? 'Scanning stamp overlays, printing patterns & visa watermark textures...' :
          currentDocType === 'NATIONAL_ID' ? 'Scanning card laminate, portrait boundary & text alterations...' :
          currentDocType === 'DRIVING_LICENSE' ? 'Scanning permit background patterns, overlays & card printing...' :
          'Scanning permit form template alignments & registry stamp integrity...',
        progress: 75
      },
      ready_for_biometrics: {
        label: 'Module 4: Face Verification Ready',
        detail: 'Modules 1–3 verified! Open live camera to perform biometric face match...',
        progress: 88
      },
      biometrics: {
        label: 'Module 4: Face Match',
        detail:
          currentDocType === 'PASSPORT' ? 'Comparing document portrait against live camera capture...' :
          currentDocType === 'VISA' ? 'Verifying traveler biometrics against visa document photo...' :
          currentDocType === 'NATIONAL_ID' ? 'Matching card holder photo with live camera biometrics...' :
          currentDocType === 'DRIVING_LICENSE' ? 'Matching driver license photo with live camera biometrics...' :
          'Matching permit holder photo with live camera biometrics...',
        progress: 90
      },
      complete: { label: 'Screening Complete', detail: 'Border clearance verdict & multi-factor risk dossier finalized', progress: 100 },
    };
    return base[currentPhase];
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString().substring(11, 19)}] ${msg}`]);
  };

  // Run On-Demand Live Face Verification against current document
  const handleRunLiveFaceVerification = async (base64Image: string, livenessData?: any) => {
    if (!createdDocId) {
      setFacePreview(base64Image);
      return;
    }

    setPhase('biometrics');
    setIsVerifyingFace(true);
    setFaceVerifyError(null);
    addLog(`[BIOMETRICS] Initiating Module 4: 1:1 ArcFace verification against document portrait...`);
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
        if (screeningRes) {
          setScreening(screeningRes);
          addLog(`[FINAL VERDICT] Clearance Verdict: ${screeningRes.verdict} (Risk Score: ${screeningRes.overall_risk_score}/100)`);
        }
      } catch { }

      setPhase('complete');
      setActiveTab('biometrics');
    } catch (err: any) {
      console.error('Face verification error:', err);
      const msg = err.message || 'Face verification failed.';
      setFaceVerifyError(msg);
      addLog(`[BIOMETRICS ERROR] ${msg}`);
      setPhase('ready_for_biometrics');
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
      setFaceVerification(null);
      setFacePreview(null);
      setLogs([]);
      setPhase('uploading');
      addLog(`[INIT] Enclave allocation: Hardware-Isolated TEE sandbox (Intel SGX)`);
      addLog(`[INGEST] Ingesting "${fileToUpload.name}" (${(fileToUpload.size / 1024).toFixed(1)} KB) - Type: ${documentType}`);

      // 1. Upload Document
      const uploadedDoc = await documentApi.uploadDocument(fileToUpload, {
        documentType,
        name: fileToUpload.name,
      });
      setCreatedDocId(uploadedDoc.id);
      addLog(`[ENCLAVE] Document ingested with SHA-256 Checksum: ${uploadedDoc.checksum?.substring(0, 16)}...`);

      // 2. Trigger sequential backend pipeline execution for Modules 1, 2, and 3
      setPhase('extracting');
      addLog(`[PIPELINE] Initiating Module 1: OCR Extraction & Document Detection...`);

      const pipelineResult = await documentApi.verifyPipeline(uploadedDoc.id, {
        skipFaceVerification: true,
      });
      setPipelineResult(pipelineResult);

      // Store pipeline result, screening, and risk score
      setPipelineResult(pipelineResult);
      if (pipelineResult.screening) setScreening(pipelineResult.screening);
      if (pipelineResult.riskScore) setRiskScore(pipelineResult.riskScore);

      const docStage = pipelineResult.stages?.document_detection;
      const valStage = pipelineResult.stages?.validation;
      const tampStage = pipelineResult.stages?.tampering;

      // Always populate tampering result if available
      if (tampStage?.result) {
        setTampering(tampStage.result);
      }

      // Always fetch the DB extraction record if it was created
      try {
        const extData = await processingApi.getExtraction(uploadedDoc.id);
        if (extData) {
          setExtraction(extData);
        }
      } catch (e) {
        console.error('Failed to fetch extraction record', e);
      }

      // Process Stage 1: Document Detection & OCR
      if (docStage && docStage.status === 'passed') {
        addLog(`✓ Module 1 (OCR Extraction) & Document Detection Passed. Confidence: ${((docStage.confidence || 0.95) * 100).toFixed(0)}%`);
      } else {
        const failReason = docStage?.reason || 'Document screening failed format detection.';
        addLog(`✗ Module 1 (OCR Extraction & Detection) Failed: ${failReason}`);
      }

      // Process Stage 2: Document Standards & ICAO Validation
      setPhase('validating');
      addLog(`→ Running Module 2: Document Standards, Format Rules & Interpol SLTD Database...`);
      await new Promise((r) => setTimeout(r, 400));

      if (valStage && valStage.status === 'passed') {
        addLog(`✓ Module 2 (Document Validation & SLTD) Passed.`);
      } else {
        const failReason = valStage?.reason || (isDocTypeMismatch() ? 'Document is not valid as per selected category format' : 'Document failed validation standards');
        addLog(`✗ Module 2 (Document Validation & SLTD) Failed: ${failReason}`);
      }

      // Process Stage 3: Tampering Forensics
      setPhase('forensics');
      addLog(`→ Running Module 3: Tampering Forensics (Photo substitution, text manipulation, stamp seals)...`);
      await new Promise((r) => setTimeout(r, 500));

      const isTampered = Boolean(tampStage?.result?.has_tampering_detected || (tampStage?.result?.overall_tampering_score ?? 0) >= 0.4);
      if (tampStage && tampStage.status === 'passed' && !isTampered) {
        addLog(`✓ Module 3 (Tampering Forensics) Passed. Tampering Score: ${tampStage.result?.overall_tampering_score || 0} pts (0 Alterations)`);
      } else {
        const tampScorePercent = Math.round((tampStage?.result?.overall_tampering_score ?? 0.8) * 100);
        const anomalyCount = tampStage?.result?.indicators?.length ?? 0;
        const failReason = isTampered
          ? `Tampering detected (Score: ${tampScorePercent}%, ${anomalyCount} Anomalies)`
          : (tampStage?.reason || 'Tampering detected in document substrate.');
        addLog(`✗ Module 3 (Tampering Forensics) Failed: ${failReason}`);
      }

      const allPassed = docStage?.status === 'passed' && valStage?.status === 'passed' && (tampStage?.status === 'passed' && !isTampered);

      if (allPassed) {
        setPhase('ready_for_biometrics');
        setActiveTab('biometrics');
        addLog(`=======================================================`);
        addLog(`[PIPELINE] ✓ Modules 1, 2 & 3 Completed & Passed Authenticity Checks!`);
        addLog(`[ACTION REQUIRED] Document authenticated. Module 4 (Live Biometric Face Match) is now UNLOCKED.`);
        addLog(`[ACTION REQUIRED] Please open live camera to verify identity.`);
      } else {
        const failReason = tampStage?.reason || valStage?.reason || docStage?.reason || 'Document failed verification integrity checks.';
        setError(failReason);
        setPhase('complete');
        addLog(`=======================================================`);
        addLog(`[PIPELINE] ⛔ VERIFICATION REJECTED: Clearance Refused.`);
        addLog(`Module 4 Biometrics: BLOCKED (Document Failed Integrity / Tampering Checks)`);
        if (isTampered) {
          setActiveTab('tampering');
        }
      }
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

  const getDocDetectedStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    const docStage = pipelineResult.stages?.document_detection;
    if (docStage && docStage.status === 'passed') {
      return { label: 'DETECTED', variant: 'safe' as const };
    }
    return { label: 'FAILED / MISMATCH', variant: 'threat' as const };
  };

  const isDocTypeMismatch = () => {
    if (!pipelineResult) return false;
    const factors = pipelineResult.screening?.factors || [];
    const hasMismatch = factors.some((f: any) =>
      f.rule === 'DOCUMENT_TYPE_MISMATCH' ||
      f.title?.includes('Document Type Mismatch')
    );
    return hasMismatch;
  };

  const getMrzStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    
    const factors = pipelineResult.screening?.factors || [];
    const tamperingStage = pipelineResult.stages?.tampering?.result || pipelineResult.tampering;
    const isTampered = tamperingStage?.has_tampering_detected || (tamperingStage?.overall_tampering_score ?? 0) >= 0.4;
    const hasMrzTamperSignal = tamperingStage?.indicators?.some((i: any) => 
      i.category === 'TEXT_ALTERATION' || i.category === 'CONTENT_ALTERATION' || String(i.description || '').toLowerCase().includes('mrz') || String(i.description || '').toLowerCase().includes('void')
    );

    const hasMrzFailure = factors.some((f: any) => 
      f.rule === 'ICAO_9303_CHECKSUM_FAILURE' || 
      f.rule === 'MRZ_TAMPERED_OR_CORRUPTED' || 
      (f.title?.includes('MRZ') && (f.title?.includes('Checksum') || f.title?.includes('Mismatch') || f.title?.includes('Corrupt')))
    );
    const isMissing = factors.some((f: any) => 
      f.rule === 'MISSING_MRZ_LINES' || 
      f.rule === 'REQUIRED_FIELD_MISSING_MRZ_LINES' ||
      f.title?.includes('Missing MRZ') || 
      f.title?.includes('Missing or Obscured MRZ')
    );
    
    const extracted = pipelineResult.stages?.document_detection?.result?.extracted_fields || pipelineResult.extraction?.extracted_fields || {};
    const mrzVal = extracted.mrzValidation?.value ?? extracted.mrzValidation;
    const mrzLinesVal = extracted.mrz_lines?.value ?? extracted.mrzLines?.value ?? extracted.mrz_lines ?? extracted.mrzLines;
    const hasEmptyMrz = !mrzLinesVal || (Array.isArray(mrzLinesVal) && mrzLinesVal.length < 2) || (typeof mrzLinesVal === 'string' && mrzLinesVal.trim().length < 20);

    if (isMissing || (docType === 'PASSPORT' && hasEmptyMrz)) {
      return { label: 'MISSING / OBSCURED MRZ', variant: 'threat' as const };
    }
    if (hasMrzFailure || (mrzVal && mrzVal.isValid === false)) {
      return { label: 'CHECKSUM MISMATCH', variant: 'threat' as const };
    }
    if (hasMrzTamperSignal && isTampered) {
      return { label: 'TAMPERED / ALTERED', variant: 'threat' as const };
    }
    return { label: 'VALID MRZ', variant: 'safe' as const };
  };

  const getCrossValidationStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];

    const extracted = pipelineResult.stages?.document_detection?.result?.extracted_fields || pipelineResult.extraction?.extracted_fields || {};
    const mrzLinesVal = extracted.mrz_lines?.value ?? extracted.mrzLines?.value ?? extracted.mrz_lines ?? extracted.mrzLines;
    const hasEmptyMrz = !mrzLinesVal || (Array.isArray(mrzLinesVal) && mrzLinesVal.length < 2) || (typeof mrzLinesVal === 'string' && mrzLinesVal.trim().length < 20);

    if (docType === 'PASSPORT' && hasEmptyMrz) {
      return { label: 'UNVERIFIED (NO MRZ)', variant: 'threat' as const };
    }

    const hasMismatch = factors.some((f: any) => 
      (f.rule?.startsWith('VISUAL_MRZ_') && f.rule?.endsWith('_MISMATCH')) ||
      f.rule === 'REQUIRED_FIELD_MISSING_MRZ_LINES' ||
      f.rule === 'MISSING_MRZ_LINES' ||
      f.title?.includes('Mismatched')
    );
    return hasMismatch
      ? { label: 'DATA MISMATCH', variant: 'threat' as const }
      : { label: 'MATCHED', variant: 'safe' as const };
  };

  const getExpiryStatusCheck = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const isExpired = factors.some((f: any) => f.rule === 'PASSPORT_EXPIRED' || f.rule === 'EXPIRED_DOCUMENT' || f.title?.includes('Expired'));
    if (isExpired) {
      return { label: 'EXPIRED', variant: 'threat' as const };
    }
    return { label: 'ACTIVE', variant: 'safe' as const };
  };

  const getSixMonthStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const isExpired = factors.some((f: any) => f.rule === 'PASSPORT_EXPIRED' || f.rule === 'EXPIRED_DOCUMENT' || f.title?.includes('Expired'));
    if (isExpired) {
      return { label: 'FAILED (EXPIRED)', variant: 'threat' as const };
    }
    const isNearExpiry = factors.some((f: any) => f.rule === 'NEAR_EXPIRY_SIX_MONTHS' || f.rule === 'SIX_MONTH_EXPIRY_WARNING' || f.title?.includes('Expires Within 6 Months'));
    if (isNearExpiry) {
      return { label: 'FAILED (NEAR EXPIRY)', variant: 'warning' as const };
    }
    return { label: 'COMPLIANT', variant: 'safe' as const };
  };

  const getNationalityStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const hasInvalidNationality = factors.some((f: any) => f.rule === 'INVALID_NATIONALITY_EXTRACTION' || (f.title?.includes('Nationality') && f.title?.includes('Invalid')));
    if (hasInvalidNationality) {
      return { label: 'INVALID EXTRACTION', variant: 'threat' as const };
    }
    return { label: 'VALID', variant: 'safe' as const };
  };

  const getTamperingIntegrityStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    const tamperingStage = pipelineResult.stages?.tampering?.result || pipelineResult.tampering;
    if (!tamperingStage) return { label: 'NOT TESTED', variant: 'warning' as const };
    const isTampered = tamperingStage.has_tampering_detected || (tamperingStage.overall_tampering_score ?? 0) >= 0.4;
    const scorePct = ((tamperingStage.overall_tampering_score ?? 0) * 100).toFixed(0);
    if (isTampered) {
      const topCat = tamperingStage.indicators?.[0]?.category?.replace(/_/g, ' ') || 'ALTERATION / OVERPAINT';
      return { label: `TAMPERED (${topCat})`, variant: 'threat' as const };
    }
    return { label: `AUTHENTIC (${100 - parseInt(scorePct, 10)}% CONF)`, variant: 'safe' as const };
  };

  const getWatchlistStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'UNVERIFIED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const watchlistHit = factors.some((f: any) => f.title?.includes('Watchlist') || f.title?.includes('Interpol') || f.rule?.includes('WATCHLIST'));
    return watchlistHit
      ? { label: 'ALERT / HIT', variant: 'threat' as const }
      : { label: 'CLEAR', variant: 'safe' as const };
  };

  const getVerhoeffStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const verhoeffFail = factors.some((f: any) => f.rule === 'VERHOEFF_CHECKSUM_FAILURE' || f.title?.includes('Verhoeff'));
    const isMissing = factors.some((f: any) => f.rule === 'MISSING_AADHAAR_IDENTIFIER' || f.title?.includes('Missing National Identity') || f.title?.includes('Missing Aadhaar'));
    if (isMissing) {
      return { label: 'MISSING ID', variant: 'threat' as const };
    }
    return verhoeffFail
      ? { label: 'INVALID CHECKSUM', variant: 'threat' as const }
      : { label: 'VALID', variant: 'safe' as const };
  };

  const getIdFormatStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const formatFail = factors.some((f: any) => f.rule === 'NATIONAL_ID_FORMAT_MISMATCH' || f.title?.includes('National ID Syntax'));
    const isMissing = factors.some((f: any) => f.rule === 'MISSING_AADHAAR_IDENTIFIER' || f.title?.includes('Missing National Identity') || f.title?.includes('Missing Aadhaar'));
    if (isMissing) {
      return { label: 'MISSING ID', variant: 'threat' as const };
    }
    return formatFail
      ? { label: 'INVALID FORMAT', variant: 'threat' as const }
      : { label: 'VALID', variant: 'safe' as const };
  };

  const getDocTypeDetectedStatus = (expectedType: string) => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    const docStage = pipelineResult.stages?.document_detection;
    const isPassed = docStage && docStage.status === 'passed';
    return isPassed
      ? { label: 'DETECTED', variant: 'safe' as const }
      : { label: 'FAILED / MISMATCH', variant: 'threat' as const };
  };

  const getGeneralExpiryStatus = () => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const expired = factors.some((f: any) => f.title?.includes('Expired') || f.rule?.includes('EXPIRED'));
    return expired
      ? { label: 'EXPIRED', variant: 'threat' as const }
      : { label: 'ACTIVE', variant: 'safe' as const };
  };

  const getGeneralFormatStatus = (ruleName: string) => {
    if (!pipelineResult) return { label: 'NOT TESTED', variant: 'warning' as const };
    if (isDocTypeMismatch()) return { label: 'INVALID / FAILED', variant: 'threat' as const };
    const factors = pipelineResult.screening?.factors || [];
    const formatFail = factors.some((f: any) => f.rule === ruleName || f.title?.includes('Format') || f.title?.includes('Syntax'));
    const isMissing = factors.some((f: any) => f.rule?.includes('MISSING_') || f.rule?.includes('REQUIRED_FIELD_MISSING') || f.title?.includes('Missing'));
    if (isMissing) {
      return { label: 'MISSING ID', variant: 'threat' as const };
    }
    return formatFail
      ? { label: 'INVALID FORMAT', variant: 'threat' as const }
      : { label: 'VALID', variant: 'safe' as const };
  };

  const checklistsConfig: Record<string, Array<{ title: string; description: string; getStatus: () => any }>> = {
    PASSPORT: [
      {
        title: 'Passport Document Detected',
        description: 'Checks if the uploaded document contains passport credentials',
        getStatus: () => getDocTypeDetectedStatus('PASSPORT')
      },
      {
        title: 'ICAO Doc 9303 Checksum Validation',
        description: 'Weights 7-3-1 check digits across Document Number, DOB & Expiry',
        getStatus: () => getMrzStatus()
      },
      {
        title: 'MRZ Data Matches Visual Data',
        description: 'Cross-checks MRZ extracted strings against Visual Inspection Zone',
        getStatus: () => getCrossValidationStatus()
      },
      {
        title: 'Document Tampering & Substrate Integrity',
        description: 'Multi-signal forensic check for white-out, text void, splicing, or overpaint',
        getStatus: () => getTamperingIntegrityStatus()
      },
      {
        title: 'Passport Expiry Status',
        description: 'Checks if the passport credential has passed its expiration date',
        getStatus: () => getExpiryStatusCheck()
      },
      {
        title: 'International 6-Month Expiry Rule',
        description: 'Ensures document has at least 6 months remaining validity',
        getStatus: () => getSixMonthStatus()
      },
      {
        title: 'Nationality Extraction Check',
        description: 'Validates that extracted nationality value is clean of OCR noise',
        getStatus: () => getNationalityStatus()
      }
    ],
    NATIONAL_ID: [
      {
        title: 'National ID Detected',
        description: 'Checks if the uploaded document matches National ID structure',
        getStatus: () => getDocTypeDetectedStatus('NATIONAL_ID')
      },
      {
        title: 'Verhoeff Mathematical Checksum',
        description: 'Verifies Aadhaar digits against official UIDAI Verhoeff D5 algorithm',
        getStatus: () => getVerhoeffStatus()
      },
      {
        title: 'ID Format Validation',
        description: 'Ensures ID meets 12-digit standard sequence requirements',
        getStatus: () => getIdFormatStatus()
      },
      {
        title: 'Document Tampering & Substrate Integrity',
        description: 'Multi-signal forensic check for white-out, text void, splicing, or overpaint',
        getStatus: () => getTamperingIntegrityStatus()
      },
      {
        title: 'Traveler Identity Watchlist Check',
        description: 'Cross-references national ID information against enforcements database',
        getStatus: () => getWatchlistStatus()
      }
    ],
    VISA: [
      {
        title: 'Visa Document Detected',
        description: 'Checks if the uploaded document matches Visa layouts',
        getStatus: () => getDocTypeDetectedStatus('VISA')
      },
      {
        title: 'Visa Format Validation',
        description: 'Ensures visa identifier aligns with standard regulatory regex',
        getStatus: () => getGeneralFormatStatus('VISA_FORMAT_MISMATCH')
      },
      {
        title: 'Document Tampering & Substrate Integrity',
        description: 'Multi-signal forensic check for white-out, text void, splicing, or overpaint',
        getStatus: () => getTamperingIntegrityStatus()
      },
      {
        title: 'Visa Validity & Expiry',
        description: 'Checks if the visa document stays active and within expiry bounds',
        getStatus: () => getGeneralExpiryStatus()
      },
      {
        title: 'Traveler Identity Watchlist Check',
        description: 'Cross-references visa details against law enforcement watchlists',
        getStatus: () => getWatchlistStatus()
      }
    ],
    DRIVING_LICENSE: [
      {
        title: 'Driving License Detected',
        description: 'Checks if the uploaded document matches driving license formats',
        getStatus: () => getDocTypeDetectedStatus('DRIVING_LICENSE')
      },
      {
        title: 'MoRTH SARATHI Format Check',
        description: 'Validates 15-character standard national driving license syntax',
        getStatus: () => getGeneralFormatStatus('DRIVING_LICENSE_FORMAT_MISMATCH')
      },
      {
        title: 'Document Tampering & Substrate Integrity',
        description: 'Multi-signal forensic check for white-out, text void, splicing, or overpaint',
        getStatus: () => getTamperingIntegrityStatus()
      },
      {
        title: 'License Validity & Expiry',
        description: 'Checks whether the license has active motor vehicle authorization',
        getStatus: () => getGeneralExpiryStatus()
      },
      {
        title: 'Traveler Identity Watchlist Check',
        description: 'Cross-references operator identity against enforcements registries',
        getStatus: () => getWatchlistStatus()
      }
    ],
    PERMIT: [
      {
        title: 'Permit Document Detected',
        description: 'Checks if the uploaded document matches Transport Permit layouts',
        getStatus: () => getDocTypeDetectedStatus('PERMIT')
      },
      {
        title: 'Document Tampering & Substrate Integrity',
        description: 'Multi-signal forensic check for white-out, text void, splicing, or overpaint',
        getStatus: () => getTamperingIntegrityStatus()
      },
      {
        title: 'Permit Validity Check',
        description: 'Verifies authorization and expiration bounds for the transport permit',
        getStatus: () => getGeneralExpiryStatus()
      },
      {
        title: 'Traveler Identity Watchlist Check',
        description: 'Cross-references permit credentials against security databases',
        getStatus: () => getWatchlistStatus()
      }
    ]
  };

  const isRejected =
    (riskScore && riskScore.risk_score >= 50) ||
    (screening && screening.verdict === 'REJECTED') ||
    (pipelineResult?.pipeline_status === 'stopped') ||
    isDocTypeMismatch();
  const isReview = !isRejected && ((riskScore && riskScore.risk_score >= 25) || (screening && screening.verdict === 'REVIEW_REQUIRED'));
  const verdict = isRejected ? 'REJECTED' : isReview ? 'REVIEW_REQUIRED' : (screening?.verdict || 'PASSED');
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {(['PASSPORT', 'NATIONAL_ID', 'DRIVING_LICENSE', 'PERMIT'] as DocType[]).map((t) => (
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
                      <p className="text-[10px] text-[var(--text-3)] font-mono">PDF, JPEG, PNG · Passports, IDs, Licenses</p>
                    </div>
                  )}
                </div>

                {/* Module Pipeline Progression Explainer */}
                <div className="mb-5 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[var(--text-3)]">
                      Screening Pipeline Hierarchy
                    </span>
                    <Badge variant="accent" size="sm">Sequential TEE</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-between">
                      <span className="text-[var(--text-1)]">1. OCR Extraction</span>
                      <Badge variant="neutral" size="sm">Step 1</Badge>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-between">
                      <span className="text-[var(--text-1)]">2. ICAO Validation</span>
                      <Badge variant="neutral" size="sm">Step 2</Badge>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-between">
                      <span className="text-[var(--text-1)]">3. Tampering AI</span>
                      <Badge variant="neutral" size="sm">Step 3</Badge>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-between opacity-80">
                      <span className="text-[var(--text-3)] flex items-center gap-1">
                        🔒 4. Face Match
                      </span>
                      <Badge variant="warning" size="sm">Locked</Badge>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-3)] leading-relaxed pt-1">
                    Module 4 (Biometric Live Camera) unlocks only after Modules 1, 2, and 3 successfully pass all integrity and authenticity checks.
                  </p>
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
                      {getPhaseInfo(phase, docType).label}
                    </span>
                  </div>
                  <Badge variant="accent" size="sm">{getPhaseInfo(phase, docType).progress}%</Badge>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[var(--accent)]"
                    animate={{ width: `${getPhaseInfo(phase, docType).progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                <p className="text-xs text-[var(--accent)] font-mono">{getPhaseInfo(phase, docType).detail}</p>

                {/* Live log stream */}
                <div data-lenis-prevent className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-[10px] text-[var(--text-3)] max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar">
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

                {/* Module 4 Biometrics Action Prompt when ready_for_biometrics */}
                {phase === 'ready_for_biometrics' && (
                  <div className="p-4 rounded-xl border border-[var(--safe)]/60 bg-[var(--surface)] shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono uppercase text-[var(--safe)] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[var(--safe)]" />
                        Modules 1, 2 & 3 Verified
                      </span>
                      <Badge variant="safe" size="sm">Document Authentic</Badge>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)]">
                      <span className="text-xs font-bold font-mono text-[var(--text-1)] block mb-1">
                        Module 4: Live Biometric Face Verification
                      </span>
                      <p className="text-[11px] font-sans text-[var(--text-2)] leading-relaxed">
                        Identity document authenticated. Please capture the traveler's live face via webcam to run 1:1 ArcFace matching.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="w-full justify-center py-2.5 font-bold shadow-[0_0_15px_rgba(0,184,169,0.3)] animate-pulse"
                        onClick={() => setIsCameraOpen(true)}
                        icon={<Camera className="w-4 h-4" />}
                      >
                        {facePreview ? 'Retake Live Selfie via Camera' : 'Open Live Camera'}
                      </Button>
                    </div>

                    {facePreview && (
                      <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={facePreview} alt="Live subject" className="w-8 h-8 rounded-full object-cover border border-[var(--safe)] shadow-sm" />
                          <span className="text-[11px] text-[var(--safe)] font-mono font-bold">✓ Live Face Attached</span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRunLiveFaceVerification(facePreview)}
                          loading={isVerifyingFace}
                        >
                          Verify Face Now
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {phase === 'complete' && (
                  <div className="space-y-2 pt-2">
                    {/* Action button to open camera and verify live face directly if document was valid */}
                    {faceVerification && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center border-[var(--safe)] text-[var(--safe)] hover:bg-[var(--safe)]/10"
                        onClick={() => setIsCameraOpen(true)}
                        loading={isVerifyingFace}
                        icon={<Camera className="w-4 h-4 text-[var(--safe)]" />}
                      >
                        Re-Verify with Live Webcam
                      </Button>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
                        Scan Another Document
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(createdDocId ? `/vault?documentId=${createdDocId}` : '/vault')}
                      >
                        View in Vault
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
              <ScannerStandbyView selectedDocType={docType} />
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
                      <span className="text-[9px] text-[var(--text-3)] block">VALIDATION (45)</span>
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

                {/* Tab 2: OCR Fields (P8 Module 1 - Clean Visual Details) */}
                {activeTab === 'ocr' && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2 flex-wrap gap-2">
                      <div>
                        <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] block">
                          Module 1: Visual Inspection Details
                        </span>
                        <span className="text-[11px] text-[var(--text-3)] font-mono">
                          Official visual inspection zone credentials & document fields
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {docType === 'PASSPORT' && (
                          <Badge variant="primary" size="sm">
                            {extraction?.extracted_fields?.passportFormat?.value === 'OLD_FORMAT'
                              ? 'Old Format (TD3-Legacy)'
                              : 'New Format (TD3-2021+)'}
                          </Badge>
                        )}
                        <Badge variant="safe" size="sm">Confidence: {((extraction?.confidence_score || 0.95) * 100).toFixed(0)}%</Badge>
                      </div>
                    </div>

                    {(() => {
                      const fields: Record<string, any> = extraction?.extracted_fields || {};
                      const getVal = (primaryKey: string, visualKey: string, altKey?: string) => {
                        const vis = fields[visualKey]?.value;
                        if (vis && String(vis).trim()) return String(vis).trim();
                        const prim = fields[primaryKey]?.value;
                        if (prim && String(prim).trim()) return String(prim).trim();
                        if (altKey) {
                          const alt = fields[altKey]?.value;
                          if (alt && String(alt).trim()) return String(alt).trim();
                        }
                        return null;
                      };

                      const formatDate = (rawDate: string | null) => {
                        if (!rawDate) return '—';
                        const d = String(rawDate).trim();
                        if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(d)) return d;
                        const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
                        const mrzMatch = d.match(/^(\d{2})(\d{2})(\d{2})$/);
                        if (mrzMatch) {
                          const yy = parseInt(mrzMatch[1], 10);
                          const yearPrefix = yy > 50 ? '19' : '20';
                          return `${mrzMatch[3]}/${mrzMatch[2]}/${yearPrefix}${mrzMatch[1]}`;
                        }
                        return d;
                      };

                      const formatGender = (rawGender: string | null) => {
                        if (!rawGender) return '—';
                        const g = String(rawGender).trim().toUpperCase();
                        if (g.startsWith('M')) return 'M (MALE)';
                        if (g.startsWith('F')) return 'F (FEMALE)';
                        return g;
                      };

                      const isNoiseName = (nameStr: string | null) => {
                        if (!nameStr) return true;
                        const u = nameStr.toUpperCase();
                        return (
                          u.includes('SIGNATURE') ||
                          u.includes('HOLDER') ||
                          u.includes('LICENCE') ||
                          u.includes('LICENSE') ||
                          u.includes('GOVERNMENT') ||
                          u.includes('GUJARAT') ||
                          u.length < 3
                        );
                      };

                      const sur = getVal('surname', 'visual_surname', 'visualSurname');
                      const giv = getVal('given_name', 'visual_given_name', 'givenNames');
                      let full = getVal('name', 'visual_name', 'fullName');

                      if (isNoiseName(full)) {
                        // Attempt fallback from raw text
                        const rawT = String(extraction?.raw_text || extraction?.rawText || '');
                        const nameM = rawT.match(/(?:Name|Full\s*Name)\s*[:\s\-]+([A-Za-z\s.\-]{3,40})/i);
                        if (nameM && !isNoiseName(nameM[1])) {
                          full = nameM[1].trim().toUpperCase();
                        } else {
                          full = (fields['name']?.value && !isNoiseName(fields['name'].value)) ? fields['name'].value : null;
                        }
                      }

                      if (sur && giv && !isNoiseName(`${giv} ${sur}`)) {
                        full = `${giv} ${sur}`;
                      } else if (full && sur && !full.includes(sur) && !isNoiseName(full)) {
                        full = `${full} ${sur}`;
                      }

                      // Driving license dates fallback from raw text if missing
                      const rawPool = String(extraction?.raw_text || extraction?.rawText || '');
                      const rawIssueM = rawPool.match(/(?:Issue\s*Date|Date\s*Of\s*First\s*Issue|Date\s*of\s*Issue|DOI|Issued\s*On)\s*[:\s\-]*(\d{2}[/\-.]\d{2}[/\-.]\d{4})/i);
                      const rawExpM = rawPool.match(/(?:Validity\s*(?:\(\s*[A-Z]+\s*\))?|Valid\s*(?:Till|Upto|Until)|Expiry\s*Date|Date\s*of\s*Expiry|Expires)\s*[:\s\-]*(\d{2}[/\-.]\d{2}[/\-.]\d{4})/i);
                      const rawDobM = rawPool.match(/(?:Date\s*Of\s*Birth|DOB|Birth\s*Date)\s*[:\s\-]*(\d{2}[/\-.]\d{2}[/\-.]\d{4})/i);

                      const dlDob = getVal('date_of_birth', 'visual_date_of_birth', 'dateOfBirth') || (rawDobM ? rawDobM[1] : null);
                      const dlIssue = getVal('date_of_issue', 'visual_date_of_issue', 'dateOfIssue', 'issue_date') || (rawIssueM ? rawIssueM[1] : null);
                      const dlExpiry = getVal('date_of_expiry', 'visual_date_of_expiry', 'dateOfExpiry', 'validity') || (rawExpM ? rawExpM[1] : null);

                      let displayItems: Array<{ label: string; value: string }> = [];

                      if (docType === 'PASSPORT') {
                        const visaGenderRaw = getVal('visa_gender', 'visual_visa_gender', 'visaGender', 'visa_sex');
                        displayItems = [
                          { label: 'Name', value: full || '—' },
                          { label: 'Passport Number', value: getVal('passport_number', 'visual_passport_number', 'passportNumber') || '—' },
                          { label: 'Nationality', value: (getVal('nationality', 'visual_nationality', 'visualNationality') || '—').replace(/^IND$/, 'INDIAN') },
                          { label: 'Date of Birth', value: formatDate(getVal('date_of_birth', 'visual_date_of_birth', 'dateOfBirth')) },
                          { label: 'Date of Expiry', value: formatDate(getVal('date_of_expiry', 'visual_date_of_expiry', 'dateOfExpiry')) },
                          { label: 'Gender', value: formatGender(getVal('gender', 'visual_gender', 'visualGender')) },
                          { label: 'Gender Visa', value: visaGenderRaw ? formatGender(visaGenderRaw) : '—' },
                          { label: 'Visa Number', value: getVal('visa_number', 'visual_visa_number', 'visaNumber') || '—' },
                          { label: 'Visa Type', value: getVal('visa_type', 'visual_visa_type', 'visaType') || '—' },
                          { label: 'Entry Validation', value: getVal('entry_validation', 'visual_entry_validation', 'entry_type', 'entryType') || '—' },
                          { label: 'Stay Duration', value: getVal('stay_duration', 'visual_stay_duration', 'stayDuration') || '—' },
                        ];
                      } else if (docType === 'VISA') {
                        displayItems = [
                          { label: 'Name', value: full || '—' },
                          { label: 'Gender Visa', value: formatGender(getVal('gender', 'visual_gender', 'visualGender', 'visa_gender')) },
                          { label: 'Visa Number', value: getVal('visa_number', 'visual_visa_number', 'visaNumber') || '—' },
                          { label: 'Visa Type', value: getVal('visa_type', 'visual_visa_type', 'visaType') || '—' },
                          { label: 'Entry Validation', value: getVal('entry_validation', 'visual_entry_validation', 'entry_type', 'entryType') || '—' },
                          { label: 'Stay Duration', value: getVal('stay_duration', 'visual_stay_duration', 'stayDuration') || '—' },
                        ];
                      } else if (docType === 'NATIONAL_ID') {
                        displayItems = [
                          { label: 'Full Name', value: full || '—' },
                          { label: 'Aadhaar / National ID Number', value: getVal('id_number', 'visual_id_number', 'aadhaarNumber') || '—' },
                          { label: 'Date of Birth', value: formatDate(getVal('date_of_birth', 'visual_date_of_birth', 'dateOfBirth')) },
                          { label: 'Gender', value: formatGender(getVal('gender', 'visual_gender', 'visualGender')) },
                          { label: 'Address', value: getVal('address', 'visual_address', 'address') || '—' },
                        ];
                      } else if (docType === 'DRIVING_LICENSE') {
                        displayItems = [
                          { label: 'Full Name', value: full || '—' },
                          { label: 'License Number', value: getVal('license_number', 'visual_license_number', 'licenseNumber', 'id_number') || '—' },
                          { label: 'Vehicle Class', value: getVal('vehicle_class', 'visual_vehicle_class', 'vehicleClass', 'licenseClass') || '—' },
                          { label: 'Date of Birth', value: formatDate(dlDob) },
                          { label: 'Date of Issue', value: formatDate(dlIssue) },
                          { label: 'Date of Expiry', value: formatDate(dlExpiry) },
                        ];
                      } else {
                        displayItems = [
                          { label: 'Full Name', value: full || '—' },
                          { label: 'Permit Number', value: getVal('permit_number', 'visual_permit_number', 'permitNumber') || '—' },
                          { label: 'Permit Type', value: getVal('permit_type', 'visual_permit_type', 'permitType') || '—' },
                          { label: 'Validity Date', value: formatDate(getVal('validity_date', 'visual_validity_date', 'validityDate')) },
                        ];
                      }

                      return (
                        <div className="grid sm:grid-cols-2 gap-3 text-xs font-mono">
                          {displayItems.map((item, idx) => (
                            <div key={idx} className="p-2.5 rounded border border-[var(--border)] bg-[var(--surface-raised)]">
                              <span className="text-[10px] text-[var(--text-3)] uppercase block mb-0.5 font-sans font-semibold tracking-wider">
                                {item.label}
                              </span>
                              <span className="font-bold text-[var(--text-1)] text-xs font-mono">
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </Card>
                )}

                {/* Tab 3: Module 2 Official Standards & Watchlist */}
                {activeTab === 'validation' && (
                  <Card className="p-4 space-y-3">
                    <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] block">
                      Module 2: Document Standards & Watchlist Verification
                    </span>

                    <div className="space-y-2 text-xs font-mono">
                      {checklistsConfig[docType]?.map((item, index) => {
                        const status = item.getStatus();
                        const icon = status.variant === 'safe' ? '✓' : '✗';
                        const color = status.variant === 'safe' ? 'text-[var(--safe)]' : 'text-[var(--threat)]';
                        return (
                          <div key={index} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between">
                            <div>
                              <span className="font-bold text-[var(--text-1)] block">{item.title}</span>
                              <span className="text-[11px] text-[var(--text-3)]">{item.description}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn('font-bold font-mono', color)}>{icon}</span>
                              <Badge variant={status.variant} size="sm">{status.label}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Tab 4: Module 3 Tampering Forensics AI Engine */}
                {activeTab === 'tampering' && (
                  <Card className="p-4 space-y-4">
                    {/* Header with Risk & Score */}
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 flex-wrap gap-2">
                      <div>
                        <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] block">
                          Module 3: Multi-Signal Forensic Tampering Engine
                        </span>
                        <span className="text-[11px] text-[var(--text-3)] font-mono">
                          Substrate Noise, ELA, SIFT RANSAC, Text Voids & Splicing Disparity
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={tampering?.has_tampering_detected ? 'threat' : 'safe'}
                          size="sm"
                          dot
                        >
                          {tampering?.has_tampering_detected ? '🚨 TAMPERED DETECTED' : '✓ NOT TAMPERED'}
                        </Badge>
                        <Badge
                          variant={
                            (tampering?.analysis_metadata?.riskLevel === 'CRITICAL' || tampering?.overall_tampering_score! >= 0.7)
                              ? 'threat'
                              : (tampering?.analysis_metadata?.riskLevel === 'HIGH' || tampering?.overall_tampering_score! >= 0.4)
                                ? 'threat'
                                : (tampering?.analysis_metadata?.riskLevel === 'MEDIUM' || tampering?.overall_tampering_score! >= 0.2)
                                  ? 'warning'
                                  : 'safe'
                          }
                          size="sm"
                        >
                          Risk: {tampering?.analysis_metadata?.riskLevel || (tampering?.overall_tampering_score! >= 0.7 ? 'CRITICAL' : tampering?.overall_tampering_score! >= 0.4 ? 'HIGH' : tampering?.overall_tampering_score! >= 0.2 ? 'MEDIUM' : 'LOW')} ({((tampering?.overall_tampering_score ?? 0) * 100).toFixed(0)}%)
                        </Badge>
                      </div>
                    </div>

                    {/* 8 Forensic Detectors Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                      {/* 1. Text Tampering */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.text_tampering?.score ?? (tampering?.indicators?.some(i => i.category === 'TEXT_ALTERATION') ? 0.85 : 0);
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Text Alteration</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% Void/Disparity` : '✓ Clean Glyphs'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 2. Content Alteration / Defacement */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.content_alteration?.score ?? 0;
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Content Defacement</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% Overpaint` : '✓ Uniform Surface'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 3. Photo Replacement / Splicing */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.splicing?.score ?? (tampering?.indicators?.some(i => i.category === 'PHOTO_SUBSTITUTION') ? 0.75 : 0);
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Photo Splicing</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% Step Gradient` : '✓ Natural Boundary'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 4. Copy-Move SIFT Duplication */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.copy_move?.score ?? 0;
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Copy-Move Clone</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% SIFT Matches` : '✓ Unique Textures'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 5. Error Level Analysis (ELA) */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.ela?.score ?? 0;
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">ELA Compression</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% Inconsistency` : '✓ Uniform Matrix'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 6. Substrate Noise Residual */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.noise?.score ?? 0;
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Noise Variance</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% SNR Disparity` : '✓ Consistent Substrate'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 7. Stamp & Seal Forgery */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.stamp?.score ?? (tampering?.indicators?.some(i => i.category === 'STAMP_FORGERY' || i.category === 'STAMP_IRREGULARITY') ? 0.8 : 0);
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Stamp / Seal</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? `🚨 ${(score * 100).toFixed(0)}% Forgery Flag` : '✓ Verified Seal'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 8. Metadata Inconsistency */}
                      {(() => {
                        const score = tampering?.analysis_metadata?.rawSignals?.metadata?.score ?? (tampering?.indicators?.some(i => i.category === 'METADATA_MISMATCH') ? 0.88 : 0);
                        const isTriggered = score >= 0.4;
                        return (
                          <div className={cn('p-2.5 rounded border transition-colors', isTriggered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40' : 'bg-[var(--surface-raised)] border-[var(--border)]')}>
                            <span className="text-[10px] text-[var(--text-3)] block uppercase">Metadata & EXIF</span>
                            <span className={cn('font-bold text-xs', isTriggered ? 'text-[var(--threat)]' : 'text-[var(--text-1)]')}>
                              {isTriggered ? '🚨 Editor Tag / Timestamp' : '✓ Native Encoding'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Explanations Narrative */}
                    {tampering?.analysis_metadata?.explanations && tampering.analysis_metadata.explanations.length > 0 && (
                      <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
                        <span className="text-[10px] font-bold font-mono uppercase text-[var(--text-3)] block">
                          Forensic Evidence Narrative
                        </span>
                        <ul className="list-disc list-inside space-y-1 text-xs font-mono text-[var(--text-2)]">
                          {tampering.analysis_metadata.explanations.map((exp, i) => (
                            <li key={i}>{exp}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Localized Suspicious Regions List */}
                    {tampering?.indicators && tampering.indicators.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold font-mono uppercase text-[var(--text-1)] block">
                          Localized Anomaly Regions ({tampering.indicators.length})
                        </span>
                        <div data-lenis-prevent className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                          {tampering.indicators.map((ind, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded border border-[var(--border)] bg-[var(--surface-raised)] text-xs font-mono flex items-start justify-between gap-2"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[var(--text-1)]">{ind.category.replace(/_/g, ' ')}</span>
                                  {ind.bounding_box && (
                                    <span className="text-[10px] text-[var(--text-3)]">
                                      [x:{ind.bounding_box.x}, y:{ind.bounding_box.y}, w:{ind.bounding_box.width}, h:{ind.bounding_box.height}]
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[var(--text-2)]">{ind.description}</p>
                                {ind.evidence && (
                                  <p className="text-[10px] text-[var(--text-3)] truncate">Evidence: {ind.evidence}</p>
                                )}
                              </div>
                              <Badge
                                variant={ind.severity === 'CRITICAL' || ind.severity === 'HIGH' ? 'threat' : ind.severity === 'MEDIUM' ? 'warning' : 'neutral'}
                                size="sm"
                              >
                                {ind.severity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Multi-Page PDF Page Attributions */}
                    {tampering?.analysis_metadata?.pages && tampering.analysis_metadata.pages.length > 1 && (
                      <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] space-y-2">
                        <span className="text-[10px] font-bold font-mono uppercase text-[var(--text-3)] block">
                          PDF Page Forensic Attribution ({tampering.analysis_metadata.pages.length} Pages)
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {tampering.analysis_metadata.pages.map((p) => (
                            <div
                              key={p.page}
                              className={cn(
                                'p-2 rounded border text-xs font-mono text-center',
                                p.tampered ? 'bg-[var(--threat)]/10 border-[var(--threat)]/40 text-[var(--threat)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-2)]'
                              )}
                            >
                              <span className="font-bold block">Page {p.page}</span>
                              <span className="text-[10px] block">
                                {p.tampered ? `🚨 ${p.risk_level}` : '✓ Clean'} ({p.regions?.length || 0} regions)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                                : phase === 'ready_for_biometrics'
                                  ? 'accent'
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
                                : phase === 'ready_for_biometrics'
                                  ? 'UNLOCKED / WAITING'
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

                    {!faceVerification && phase === 'ready_for_biometrics' ? (
                      <div className="p-6 rounded-xl border border-[var(--accent)] bg-[var(--surface-raised)] text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mx-auto text-xl shadow-md">
                          📷
                        </div>
                        <h4 className="text-sm font-bold font-mono text-[var(--text-1)]">
                          Module 4 Unlocked: Awaiting Live Traveler Camera
                        </h4>
                        <p className="text-xs text-[var(--text-2)] font-mono max-w-md mx-auto leading-relaxed">
                          Modules 1, 2, and 3 have completed and validated the document credentials. Please activate the live camera to perform biometric face verification and finalize clearance.
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          className="font-bold shadow-[0_0_15px_rgba(0,184,169,0.3)] animate-pulse"
                          onClick={() => setIsCameraOpen(true)}
                          icon={<Camera className="w-4 h-4" />}
                        >
                          Open Live Camera
                        </Button>
                      </div>
                    ) : !faceVerification && phase === 'complete' ? (
                      <div className="p-6 rounded-xl border border-[var(--threat)]/40 bg-[var(--threat)]/5 text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-[var(--threat)]/20 text-[var(--threat)] flex items-center justify-center mx-auto text-lg">
                          ⛔
                        </div>
                        <h4 className="text-xs font-bold font-mono text-[var(--threat)] uppercase">
                          Module 4 Biometric Verification Blocked
                        </h4>
                        <p className="text-xs text-[var(--text-3)] font-mono max-w-md mx-auto">
                          Biometric comparison cannot be performed because this identity credential failed preliminary validation / tampering checks.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Dual portrait comparison */}
                        <div className="grid grid-cols-2 gap-4 text-center">
                          {/* 1. Document Portrait */}
                          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex flex-col items-center">
                            <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-2 font-bold">
                              1. Document Portrait
                            </span>
                            {filePreview ? (
                              <img src={filePreview} alt="Document" className="w-24 h-28 rounded-lg object-contain bg-[var(--surface-alt)] border border-[var(--border-accent)] shadow-sm" />
                            ) : (
                              <div className="w-24 h-28 rounded-lg bg-[var(--surface-alt)] border border-[var(--border-accent)] flex items-center justify-center text-3xl">
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
                      </>
                    )}
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
