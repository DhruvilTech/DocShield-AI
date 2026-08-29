// src/validators/faceVerification.validator.js
import { z } from 'zod';

export const faceVerificationSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
  referenceFaceBase64: z.string().optional(),
  referenceFaceBuffer: z.any().optional(),
  threshold: z.number().min(0).max(1).optional(),
  livenessResult: z
    .object({
      status: z.enum(['PASS', 'FAIL']),
      confidence: z.number().optional(),
      reason: z.string().optional(),
      stages_completed: z.array(z.string()).optional(),
    })
    .optional(),
  livenessVideoBase64: z.string().optional(),
  simulateMismatch: z.boolean().optional(),
  simulateInconclusive: z.boolean().optional(),
  simulateNoFace: z.boolean().optional(),
  simulateMultipleFaces: z.boolean().optional(),
  simulatePoorQuality: z.boolean().optional(),
  simulateLivenessFail: z.boolean().optional(),
});
