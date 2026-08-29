// src/validators/tampering.validator.js
import { z } from 'zod';

export const runTamperingSchema = z.object({
  versionNumber: z.coerce.number().int().positive().optional(),
});
