// src/validators/screening.validator.js
import { z } from 'zod';

export const runScreeningSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
  forceRerun: z.boolean().optional(),
  simulateMismatch: z.boolean().optional(),
  simulateInconclusive: z.boolean().optional(),
});
