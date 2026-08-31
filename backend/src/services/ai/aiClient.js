// src/services/ai/aiClient.js
import { env } from '../../config/env.js';

export class AiClient {
  /**
   * Send document image/file to the unified FastAPI AI service for Stage 1 Document Detection.
   * 
   * @param {Buffer} fileBuffer - The binary document file content.
   * @param {string} originalFilename - The original name of the uploaded document.
   * @param {string} mimeType - The MIME type of the file.
   * @param {string} documentType - The uppercase document type (e.g. 'PASSPORT').
   */
  async analyzeDocument(fileBuffer, originalFilename, mimeType, documentType) {
    if (!env.AI_SERVICE_URL) {
      throw new Error('AI_SERVICE_URL is not configured in environment variables.');
    }

    const url = `${env.AI_SERVICE_URL}/api/v1/document/screen-document`;

    const formData = new FormData();
    // Convert Buffer to Blob for standard FormData upload
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('file', blob, originalFilename);
    formData.append('document_type', documentType.toLowerCase());

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`FastAPI Document Detection failed with status ${response.status}: ${errText}`);
    }

    return await response.json();
  }
}

export const aiClient = new AiClient();
