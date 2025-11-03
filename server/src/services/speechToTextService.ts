import fs from 'node:fs';
import path from 'node:path';
import { type Buffer } from 'buffer';

import axios from 'axios';

import { config } from '../config';
import { SpeechToTextResult } from '../types/message';
import { logger } from '../utils/logger';

type SupportedLocale = 'fa' | 'en';

export class SpeechToTextService {
  private readonly endpoint = 'https://api.deepgram.com/v1/listen';

  async transcribe(audioPath: string, locale: SupportedLocale): Promise<SpeechToTextResult | null> {
    if (!config.deepgramApiKey) {
      logger.warn({ audioPath, locale }, 'deepgram API key missing, skipping transcription');
      return null;
    }

    const absolutePath = path.isAbsolute(audioPath) ? audioPath : path.resolve(config.mediaRoot, audioPath);

    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(absolutePath);
    } catch (readError) {
      logger.error({ err: readError, audioPath: absolutePath }, 'failed to read audio file for transcription');
      return null;
    }

    const mimeType = this.resolveMimeType(absolutePath);

    try {
      const response = await axios.post(
        this.endpoint,
        buffer,
        {
          headers: {
            Authorization: `Token ${config.deepgramApiKey}`,
            'Content-Type': mimeType,
          },
          params: {
            model: this.resolveModel(locale),
            language: locale,
            smart_format: true,
          },
          timeout: 25_000,
        },
      );

      const alternative = response.data?.results?.channels?.[0]?.alternatives?.[0];
      if (!alternative?.transcript) {
        logger.warn({ audioPath: absolutePath, locale, response: response.data }, 'deepgram returned no transcript');
        return null;
      }

      return {
        transcriptionText: alternative.transcript as string,
        confidence: (alternative.confidence as number | undefined) ?? 0,
        locale,
      };
    } catch (error) {
      logger.error({ err: error, audioPath: absolutePath, locale }, 'failed to transcribe audio with Deepgram');
      return null;
    }
  }

  private resolveModel(locale: SupportedLocale): string {
    if (locale === 'fa') {
      return 'nova-2';
    }
    return 'nova-2';
  }

  private resolveMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.m4a') return 'audio/mp4';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.wav') return 'audio/wav';
    return 'audio/*';
  }
}

export const speechToTextService = new SpeechToTextService();
