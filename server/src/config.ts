import path from 'node:path';

import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly databaseFile: string;
  readonly mediaRoot: string;
  readonly ollamaUrl?: string;
  readonly ollamaModel: string;
  readonly googleTranslateFallback: boolean;
  readonly deepgramApiKey?: string;
  readonly clientOrigin: string;
}

const rootDir = path.resolve(__dirname, '..');

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 3021),
  host: process.env.HOST ?? '0.0.0.0',
  databaseFile: process.env.DATABASE_FILE
    ? path.resolve(process.cwd(), process.env.DATABASE_FILE)
    : path.join(rootDir, '..', 'storage', 'chat.db'),
  mediaRoot: process.env.MEDIA_ROOT
    ? path.resolve(process.cwd(), process.env.MEDIA_ROOT)
    : path.join(rootDir, '..', 'storage', 'media'),
  ollamaUrl: process.env.OLLAMA_URL,
  ollamaModel: process.env.OLLAMA_MODEL ?? 'ollama2persian',
  googleTranslateFallback: (process.env.GOOGLE_TRANSLATE_FALLBACK ?? 'true').toLowerCase() === 'true',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  clientOrigin: process.env.CLIENT_ORIGIN ?? '*',
};
