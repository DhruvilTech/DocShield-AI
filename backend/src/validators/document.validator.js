// src/validators/document.validator.js
import { z } from 'zod';
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../config/constants.js';

export const uploadDocumentSchema = z.object({
  name: z.string().min(1, 'Document name is required').max(255),
  documentType: z.enum(Object.values(DOCUMENT_TYPES)).default(DOCUMENT_TYPES.OTHER),
  description: z.string().max(1000).optional().nullable(),
});

export const updateDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  documentType: z.enum(Object.values(DOCUMENT_TYPES)).optional(),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(Object.values(DOCUMENT_STATUSES)).optional(),
});
