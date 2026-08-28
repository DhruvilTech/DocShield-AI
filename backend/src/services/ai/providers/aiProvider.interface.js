// src/services/ai/providers/aiProvider.interface.js

/**
 * Base interface for AI Intelligence Providers
 */
export class AiProviderInterface {
  /**
   * Analyze document prompt payload
   * @param {Object} promptData
   * @param {string} promptData.systemPrompt
   * @param {string} promptData.userPrompt
   * @param {Object} promptData.sanitizedPayload
   * @returns {Promise<Object>} raw or parsed model response
   */
  async analyze(promptData) {
    throw new Error('Method analyze() must be implemented by provider');
  }

  getProviderName() {
    throw new Error('Method getProviderName() must be implemented by provider');
  }

  getModelName() {
    throw new Error('Method getModelName() must be implemented by provider');
  }
}
