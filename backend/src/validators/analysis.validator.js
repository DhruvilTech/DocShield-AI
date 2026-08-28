// src/validators/analysis.validator.js
import { z } from 'zod';

export const runAnalysisSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
  provider: z.enum(['heuristic', 'gemini', 'openai', 'mock']).optional(),
});
