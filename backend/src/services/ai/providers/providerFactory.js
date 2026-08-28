// src/services/ai/providers/providerFactory.js
import { HeuristicAiProvider } from './heuristicProvider.js';
import { GeminiAiProvider } from './geminiProvider.js';
import { OpenAiProvider } from './openaiProvider.js';
import { env } from '../../../config/env.js';

export class AiProviderFactory {
  /**
   * Get configured AI provider instance
   */
  static getProvider(providerName = env.AI_PROVIDER) {
    const selected = (providerName || 'heuristic').toLowerCase();

    if (selected === 'gemini') {
      if (env.GEMINI_API_KEY) {
        return new GeminiAiProvider(env.GEMINI_API_KEY, env.AI_MODEL || 'gemini-1.5-pro');
      }
      console.warn('Gemini configured but GEMINI_API_KEY missing, using deterministic heuristic intelligence provider');
      return new HeuristicAiProvider();
    }

    if (selected === 'openai') {
      if (env.OPENAI_API_KEY) {
        return new OpenAiProvider(env.OPENAI_API_KEY, env.AI_MODEL || 'gpt-4o-mini');
      }
      console.warn('OpenAI configured but OPENAI_API_KEY missing, using deterministic heuristic intelligence provider');
      return new HeuristicAiProvider();
    }

    return new HeuristicAiProvider(env.AI_MODEL || 'docshield-deterministic-intelligence-v1');
  }
}
