// tests/verificationPipeline.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';
import { aiClient } from '../src/services/ai/aiClient.js';
import { tamperingDetectorService } from '../src/services/tampering/tamperingDetector.service.js';
import { faceVerificationService } from '../src/services/faceVerification/faceVerification.service.js';
import { tamperingRepository } from '../src/repositories/tampering.repository.js';
import { faceVerificationRepository } from '../src/repositories/faceVerification.repository.js';

describe('Sequential Verification Pipeline Integration Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken;
  let defaultOrgId;
  let createMockDocument;

  // Save original methods
  const originalAnalyzeDocument = aiClient.analyzeDocument;
  const originalAnalyzeTampering = tamperingDetectorService.analyzeDocument;
  const originalVerifyFace = faceVerificationService.verifyFace;

  before(async () => {
    await seedDatabase();
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // Admin login
    const adminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@docshield.ai', password: 'AdminPassword123!' }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.data.tokens.accessToken;

    // Get default organization ID
    const orgsRes = await fetch(`${baseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const orgsData = await orgsRes.json();
    defaultOrgId = orgsData.data.organizations[0].id;

    // Helper to create a fresh mock document for each scenario
    createMockDocument = async (filename = 'passport.jpg', docType = 'PASSPORT') => {
      const docRes = await fetch(`${baseUrl}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-organization-id': defaultOrgId,
        },
        body: (() => {
          const formData = new FormData();
          const fileBlob = new Blob(['Mock document content'], { type: 'image/jpeg' });
          formData.append('file', fileBlob, filename);
          formData.append('name', 'Test Pipeline Passport');
          formData.append('documentType', docType);
          return formData;
        })(),
      });
      const docData = await docRes.json();
      return docData.data.document.id;
    };
  });

  after(async () => {
    // Restore original methods
    aiClient.analyzeDocument = originalAnalyzeDocument;
    tamperingDetectorService.analyzeDocument = originalAnalyzeTampering;
    faceVerificationService.verifyFace = originalVerifyFace;

    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      await db.close();
    } catch (e) {}
  });

  test('Scenario 1 — Invalid Document: Should stop at Stage 1 and skip Stage 2 and Stage 3', async () => {
    const docId = await createMockDocument();
    // Mock FastAPI Document Detection to return unsupported document type
    aiClient.analyzeDocument = async () => {
      return {
        request_id: 'test-req-id-s1',
        document_type: 'unknown',
        ocr: { raw_text: '', confidence: 0.0 },
        extracted_fields: {},
        validation: {
          document_type: 'UNKNOWN',
          valid: false,
          checks: [],
          errors: ['Uploaded file could not be verified as a supported document'],
          warnings: []
        }
      };
    };

    // Keep track if Stage 2/3 were executed
    let stage2Executed = false;
    let stage3Executed = false;

    tamperingDetectorService.analyzeDocument = async () => {
      stage2Executed = true;
      return { has_tampering_detected: false, overall_tampering_score: 0.0 };
    };

    faceVerificationService.verifyFace = async () => {
      stage3Executed = true;
      return { status: 'MATCH', similarity_score: 0.9 };
    };

    // Execute sequential pipeline
    const res = await fetch(`${baseUrl}/documents/${docId}/verify-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true); // API request successfully processed
    
    const pipelineData = body.data;
    assert.strictEqual(pipelineData.success, false); // Business pipeline verification failed
    assert.strictEqual(pipelineData.pipeline_status, 'stopped');
    assert.strictEqual(pipelineData.failed_stage, 'document_detection');
    assert.deepStrictEqual(pipelineData.completed_stages, ['document_detection']);
    assert.strictEqual(pipelineData.stages.document_detection.status, 'failed');
    assert.strictEqual(pipelineData.stages.tampering.status, 'skipped');
    assert.strictEqual(pipelineData.stages.face_verification.status, 'skipped');

    assert.strictEqual(stage2Executed, false);
    assert.strictEqual(stage3Executed, false);

    // Verify database audit trail: skipped records are logged in their tables
    const latestTampering = await tamperingRepository.findLatestByDocument(docId, defaultOrgId);
    assert.strictEqual(latestTampering.status, 'SKIPPED');

    const latestFace = await faceVerificationRepository.findLatestByDocument(docId, defaultOrgId);
    assert.strictEqual(latestFace.status, 'SKIPPED');
  });

  test('Scenario 2 — Valid Document but Tampered: Should pass Stage 1, fail Stage 2, and skip Stage 3', async () => {
    const docId = await createMockDocument();
    // Mock FastAPI Document Detection to pass
    aiClient.analyzeDocument = async () => {
      return {
        request_id: 'test-req-id-s2',
        document_type: 'passport',
        ocr: { raw_text: 'Valid OCR text', confidence: 0.95 },
        extracted_fields: { passportNumber: { value: 'P12345678', confidence: 0.99 } },
        validation: {
          document_type: 'PASSPORT',
          valid: true,
          checks: [],
          errors: [],
          warnings: []
        }
      };
    };

    // Stage 2 fails (tampering detected)
    tamperingDetectorService.analyzeDocument = async (docId, orgId) => {
      return tamperingRepository.createAnalysis({
        documentId: docId,
        versionId: (await db.query('SELECT id FROM document_versions WHERE document_id = ? LIMIT 1', [docId]))[0].id,
        organizationId: orgId,
        status: 'COMPLETED',
        overallTamperingScore: 0.45,
        hasTamperingDetected: true,
        analysisMetadata: { useCaseCoverage: {} }
      });
    };

    let stage3Executed = false;
    faceVerificationService.verifyFace = async () => {
      stage3Executed = true;
      return { status: 'MATCH', similarity_score: 0.9 };
    };

    const res = await fetch(`${baseUrl}/documents/${docId}/verify-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);

    const pipelineData = body.data;
    assert.strictEqual(pipelineData.success, false);
    assert.strictEqual(pipelineData.pipeline_status, 'stopped');
    assert.strictEqual(pipelineData.failed_stage, 'tampering');
    assert.deepStrictEqual(pipelineData.completed_stages, ['document_detection', 'tampering']);
    assert.strictEqual(pipelineData.stages.document_detection.status, 'passed');
    assert.strictEqual(pipelineData.stages.tampering.status, 'failed');
    assert.strictEqual(pipelineData.stages.face_verification.status, 'skipped');

    assert.strictEqual(stage3Executed, false);

    // Verify database audit trail: skipped Face Verification logged in database
    const latestFace = await faceVerificationRepository.findLatestByDocument(docId, defaultOrgId);
    assert.strictEqual(latestFace.status, 'SKIPPED');
  });

  test('Scenario 3 — Complete Success: All stages run and pass', async () => {
    const docId = await createMockDocument();
    aiClient.analyzeDocument = async () => {
      return {
        request_id: 'test-req-id-s3',
        document_type: 'passport',
        ocr: { raw_text: 'Valid OCR text', confidence: 0.95 },
        extracted_fields: { passportNumber: { value: 'P12345678', confidence: 0.99 } },
        validation: {
          document_type: 'PASSPORT',
          valid: true,
          checks: [],
          errors: [],
          warnings: []
        }
      };
    };

    tamperingDetectorService.analyzeDocument = async (docId, orgId) => {
      return tamperingRepository.createAnalysis({
        documentId: docId,
        versionId: (await db.query('SELECT id FROM document_versions WHERE document_id = ? LIMIT 1', [docId]))[0].id,
        organizationId: orgId,
        status: 'COMPLETED',
        overallTamperingScore: 0.05,
        hasTamperingDetected: false,
        analysisMetadata: {}
      });
    };

    faceVerificationService.verifyFace = async (docId, orgId) => {
      return faceVerificationRepository.create({
        documentId: docId,
        versionId: (await db.query('SELECT id FROM document_versions WHERE document_id = ? LIMIT 1', [docId]))[0].id,
        organizationId: orgId,
        status: 'MATCH',
        similarityScore: 0.88,
        confidence: 0.88,
        matchThreshold: 0.45,
        modelName: 'docshield-facenet-v1',
        faceDetectedInDoc: true,
        referenceFaceProvided: true,
        processingTimeMs: 120,
        metadata: {}
      });
    };

    const res = await fetch(`${baseUrl}/documents/${docId}/verify-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({ referenceFaceBase64: 'dGVzdA==' }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);

    const pipelineData = body.data;
    assert.strictEqual(pipelineData.success, true);
    assert.strictEqual(pipelineData.pipeline_status, 'completed');
    assert.strictEqual(pipelineData.failed_stage, null);
    assert.deepStrictEqual(pipelineData.completed_stages, ['document_detection', 'tampering', 'face_verification']);
    assert.strictEqual(pipelineData.stages.document_detection.status, 'passed');
    assert.strictEqual(pipelineData.stages.tampering.status, 'passed');
    assert.strictEqual(pipelineData.stages.face_verification.status, 'passed');
  });

  test('Scenario 4 — AI Service Failure: Handle FastAPI network errors gracefully', async () => {
    const docId = await createMockDocument();
    // Mock FastAPI Document Detection to raise a system network error
    aiClient.analyzeDocument = async () => {
      throw new Error('Connect ETIMEDOUT 127.0.0.1:8000');
    };

    const res = await fetch(`${baseUrl}/documents/${docId}/verify-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 500); // Properly translated to a system error (500)
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'DOCUMENT_DETECTION_FAILED');
  });

  test('Scenario 5 — Mismatched Document Type: Should stop at Stage 1 with Document Category Mismatch error', async () => {
    const docId = await createMockDocument();
    // Mock FastAPI Document Detection to return a Passport selection but Driving License OCR text
    aiClient.analyzeDocument = async () => {
      return {
        request_id: 'test-req-id-s5',
        document_type: 'passport',
        ocr: { raw_text: 'UNION OF INDIA DRIVING LICENCE MH0120200034761', confidence: 0.95 },
        extracted_fields: { license_number: 'MH0120200034761' },
        validation: {
          document_type: 'DRIVING_LICENSE',
          valid: false,
          checks: [],
          errors: [],
          warnings: []
        }
      };
    };

    // Execute sequential pipeline
    const res = await fetch(`${baseUrl}/documents/${docId}/verify-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    
    const pipelineData = body.data;
    assert.strictEqual(pipelineData.success, false);
    assert.strictEqual(pipelineData.pipeline_status, 'stopped');
    assert.strictEqual(pipelineData.failed_stage, 'document_detection');
    assert.strictEqual(pipelineData.stages.document_detection.status, 'failed');
    assert.strictEqual(pipelineData.stages.document_detection.reason, 'Document is not valid as per selected document');
  });
});
