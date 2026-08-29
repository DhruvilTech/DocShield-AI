// src/validators/risk.validator.js
import { z } from 'zod';

export const calculateRiskSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
});
