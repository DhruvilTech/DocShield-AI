// src/services/ai/providers/geminiProvider.js
import { AiProviderInterface } from './aiProvider.interface.js';
import { env } from '../../../config/env.js';

export class GeminiAiProvider extends AiProviderInterface {
  constructor(apiKey = env.GEMINI_API_KEY, modelName = env.AI_MODEL || 'gemini-1.5-pro') {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  getProviderName() {
    return 'gemini';
  }

  getModelName() {
    return this.modelName;
  }

  async analyze(promptData) {
    if (!this.apiKey) {
      throw new Error('Gemini API key is not configured in environment variables');
    }

    const { systemPrompt, userPrompt } = promptData;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\nTask:\n${userPrompt}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API returned HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const candidateText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Gemini API returned empty candidate response');
    }

    return candidateText;
  }
}
