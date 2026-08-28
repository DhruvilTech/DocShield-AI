// src/validators/processing.validator.js
import { z } from 'zod';

export const triggerProcessingSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
  jobType: z.enum(['FULL_PIPELINE', 'EXTRACTION_ONLY', 'ANALYSIS_ONLY']).default('FULL_PIPELINE'),
});
