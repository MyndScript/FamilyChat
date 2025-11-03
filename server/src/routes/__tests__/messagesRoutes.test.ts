import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Server } from 'socket.io';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationDirection } from '../../services/translationService';
import type { TranslationResult } from '../../types/message';

describe('messages routes', () => {
  let emitSpy: ReturnType<typeof vi.fn>;
  let app: import('express').Express;
  let translationSpy: { mockRestore: () => void } | undefined;

  beforeEach(async () => {
    vi.resetModules();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-server-test-'));
    process.env.DATABASE_FILE = path.join(tempDir, 'db.sqlite');
    process.env.MEDIA_ROOT = path.join(tempDir, 'media');
    fs.mkdirSync(process.env.MEDIA_ROOT, { recursive: true });
    process.env.GOOGLE_TRANSLATE_FALLBACK = 'false';
    delete process.env.OLLAMA_URL;

    const express = (await import('express')).default;
    const { createMessagesRouter } = await import('../messages');
  const { createTranslationAnalyticsRouter } = await import('../translationAnalytics');
    const translationModule = await import('../../services/translationService');
    const databaseModule = await import('../../storage/database');

    translationSpy = vi
      .spyOn(translationModule.translationService, 'translate')
      .mockImplementation(async (_text: string, direction: TranslationDirection): Promise<TranslationResult> => {
        databaseModule.translationAnalyticsRepository.record('ollama', 42);
        return {
          translatedText: direction === 'en-to-fa' ? 'سلام' : 'Hello',
          toneAdjustedText: direction === 'en-to-fa' ? 'عزیزم سلام ❤️' : 'Hello ❤️',
          locale: direction === 'en-to-fa' ? 'fa' : 'en',
          provider: 'ollama',
        };
      });

    emitSpy = vi.fn();
    const io = { emit: emitSpy } as unknown as Server;

    app = express();
    app.use(express.json());
    app.use('/api/messages', createMessagesRouter(io));
  app.use('/api/analytics', createTranslationAnalyticsRouter());
  });

  afterEach(() => {
    translationSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  it('returns translation provider in message responses and analytics', async () => {
    const res = await request(app)
      .post('/api/messages/text')
      .send({ personaId: 'brian', text: 'Hi there' })
      .expect(201);

    expect(res.body.message.translationProvider).toBe('ollama');
    expect(emitSpy).toHaveBeenCalledWith('message:new', expect.objectContaining({ translationProvider: 'ollama' }));

    const listRes = await request(app).get('/api/messages').expect(200);
    expect(listRes.body.messages[0].translationProvider).toBe('ollama');

    const analyticsRes = await request(app).get('/api/analytics/translation-providers').expect(200);
    expect(analyticsRes.body.providers).toEqual([
      expect.objectContaining({
        provider: 'ollama',
        selectionCount: 1,
        averageLatencyMs: 42,
      }),
    ]);
  });

  it('returns empty analytics when no selections recorded', async () => {
    const analyticsRes = await request(app).get('/api/analytics/translation-providers').expect(200);
    expect(analyticsRes.body.providers).toEqual([]);
  });
});
