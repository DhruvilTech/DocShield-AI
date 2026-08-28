// src/services/ai/providers/openaiProvider.js
import { AiProviderInterface } from './aiProvider.interface.js';
import { env } from '../../../config/env.js';

export class OpenAiProvider extends AiProviderInterface {
  constructor(apiKey = env.OPENAI_API_KEY, modelName = env.AI_MODEL || 'gpt-4o-mini') {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  getProviderName() {
    return 'openai';
  }

  getModelName() {
    return this.modelName;
  }

  async analyze(promptData) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not configured in environment variables');
    }

    const { systemPrompt, userPrompt } = promptData;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API returned HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const messageContent = result.choices?.[0]?.message?.content;

    if (!messageContent) {
      throw new Error('OpenAI API returned empty completion content');
    }

    return messageContent;
  }
}
