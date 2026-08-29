// src/validators/faceVerification.validator.js
import { z } from 'zod';

export const faceVerificationSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
  referenceFaceBase64: z.string().optional(),
  simulateMismatch: z.boolean().optional(),
  simulateInconclusive: z.boolean().optional(),
});
