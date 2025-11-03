import axios from 'axios';

import { config } from '../config';
import { TranslationResult } from '../types/message';
import { logger } from '../utils/logger';
import { translationAnalyticsRepository } from '../storage/database';

export type TranslationDirection = 'en-to-fa' | 'fa-to-en';

type TranslationProvider = 'ollama' | 'google';

interface TranslationCandidate {
  provider: TranslationProvider;
  text: string;
  latencyMs: number;
}

export class TranslationService {
  async translate(text: string, direction: TranslationDirection, context: string[] = []): Promise<TranslationResult> {
    const targetLocale = direction === 'en-to-fa' ? 'fa' : 'en';
    const sourceLocale = direction === 'en-to-fa' ? 'en' : 'fa';

    const candidates = await this.collectCandidates(text, sourceLocale, targetLocale, direction, context);
    if (candidates.length === 0) {
      throw new Error('No translation candidates available');
    }

    const selected = this.selectBestCandidate(text, targetLocale, direction, context, candidates);
    const toneAdjusted = this.addWarmth(selected.text, targetLocale, context);

    logger.debug({ provider: selected.provider, latencyMs: selected.latencyMs, direction }, 'selected translation provider');
    try {
      translationAnalyticsRepository.record(selected.provider, selected.latencyMs);
    } catch (error) {
      logger.warn({ err: error }, 'failed to record translation analytics');
    }

    return {
      translatedText: selected.text,
      toneAdjustedText: toneAdjusted,
      locale: targetLocale,
      provider: selected.provider,
    };
  }

  private async collectCandidates(
    text: string,
    from: string,
    to: string,
    direction: TranslationDirection,
    context: string[],
  ): Promise<TranslationCandidate[]> {
    const candidates: TranslationCandidate[] = [];

    const tasks: Array<Promise<void>> = [];

    if (config.ollamaUrl) {
      tasks.push((async () => {
        const start = Date.now();
        try {
          const responseText = await this.translateViaOllama(text, direction, context);
          candidates.push({
            provider: 'ollama',
            text: responseText,
            latencyMs: Date.now() - start,
          });
        } catch (error) {
          logger.warn({ err: error }, 'ollama translation failed');
        }
      })());
    }

    if (config.googleTranslateFallback) {
      tasks.push((async () => {
        const start = Date.now();
        try {
          const responseText = await this.translateViaGoogle(text, from, to);
          candidates.push({
            provider: 'google',
            text: responseText,
            latencyMs: Date.now() - start,
          });
        } catch (error) {
          logger.warn({ err: error }, 'google translation failed');
        }
      })());
    }

    if (tasks.length === 0) {
      return candidates;
    }

    await Promise.allSettled(tasks);
    return candidates;
  }

  private selectBestCandidate(
    originalText: string,
    targetLocale: 'fa' | 'en',
    direction: TranslationDirection,
    context: string[],
    candidates: TranslationCandidate[],
  ): TranslationCandidate {
    if (candidates.length === 1) {
      return candidates[0];
    }

    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const score = this.scoreCandidate(originalText, candidate, targetLocale, direction, context);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  private scoreCandidate(
    originalText: string,
    candidate: TranslationCandidate,
    targetLocale: 'fa' | 'en',
    direction: TranslationDirection,
    context: string[],
  ): number {
    const text = candidate.text.trim();
    if (text.length === 0) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    const affectionScore = this.affectionHeuristic(text, targetLocale);
    score += affectionScore;

    const lengthDelta = Math.abs(text.length - originalText.length);
    score -= lengthDelta * 0.01;

    if (text.toLowerCase() === originalText.toLowerCase()) {
      score -= 5;
    }

    const contextAffinity = context.filter(Boolean).some((entry) => text.includes(entry.slice(0, Math.min(6, entry.length))));
    if (contextAffinity) {
      score += 0.5;
    }

    score -= candidate.latencyMs / 1000;

    if (candidate.provider === 'ollama' && direction === 'fa-to-en') {
      score += 0.5;
    }

    return score;
  }

  private affectionHeuristic(text: string, targetLocale: 'fa' | 'en'): number {
    let score = 0;
    if (targetLocale === 'fa') {
      if (text.includes('عزیزم') || text.includes('جانم') || text.includes('مهربانم')) {
        score += 1.5;
      }
      if (text.includes('❤️')) {
        score += 1;
      }
    } else {
      if (/(dear|love|sweetheart|my heart)/i.test(text)) {
        score += 1.5;
      }
      if (text.includes('❤️')) {
        score += 1;
      }
    }
    return score;
  }

  private async translateViaGoogle(text: string, from: string, to: string): Promise<string> {
    if (!config.googleTranslateFallback) {
      throw new Error('Google Translate is disabled');
    }

    const translate = await loadTranslate();
    const result = await translate(text, {
      from,
      to,
    });

    if (!result?.text) {
      throw new Error('Invalid Google Translate response');
    }

    return result.text;
  }

  private async translateViaOllama(text: string, direction: TranslationDirection, context: string[]): Promise<string> {
    const prompt = this.buildOllamaPrompt(text, direction, context);
    const response = await axios.post(
      `${config.ollamaUrl}/api/generate`,
      {
        model: config.ollamaModel,
        prompt,
        stream: false,
      },
      {
        timeout: 20_000,
      },
    );

    if (!response.data || typeof response.data.response !== 'string') {
      throw new Error('Unexpected Ollama response');
    }

    return response.data.response.trim();
  }

  private buildOllamaPrompt(text: string, direction: TranslationDirection, context: string[]): string {
    const targetLanguage = direction === 'en-to-fa' ? 'Persian' : 'English';
    const sourceLanguage = direction === 'en-to-fa' ? 'English' : 'Persian';
    const toneInstructions = direction === 'en-to-fa'
      ? 'Keep the tone tender, familial, add natural warmth and loving expressions without sounding machine-translated.'
      : 'Translate to clear, friendly English while keeping affectionate nuances.';
    const contextJoined = context.filter(Boolean).slice(0, 5).join('\n');

    return `You are a caring bilingual assistant helping two partners communicate.
Context (most recent first):
${contextJoined}

Translate the following ${sourceLanguage} message into ${targetLanguage}.
Return only the translated sentence with polished, loving tone.
Message: ${text}

${toneInstructions}`;
  }

  private addWarmth(translated: string, locale: string, context: string[]): string {
    if (locale === 'fa') {
      const softened = translated.includes('عزیزم') ? translated : `عزیزم ${translated}`;
      const closing = context.some((entry) => entry.includes('❤️')) ? '' : ' ❤️';
      return `${softened}${closing}`.trim();
    }

    if (locale === 'en') {
      return translated.includes('❤️') ? translated : `${translated} ❤️`;
    }

    return translated;
  }
}

export const translationService = new TranslationService();

type TranslateFn = typeof import('@vitalets/google-translate-api')['translate'];
let cachedTranslate: TranslateFn | null = null;

async function loadTranslate(): Promise<TranslateFn> {
  if (cachedTranslate) {
    return cachedTranslate;
  }
  const mod = await import('@vitalets/google-translate-api');
  cachedTranslate = mod.translate;
  if (!cachedTranslate) {
    throw new Error('Failed to load google-translate-api');
  }
  return cachedTranslate;
}
