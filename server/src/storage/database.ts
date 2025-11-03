import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { config } from '../config';
import { Attachment, Message, Reaction } from '../types/message';

const dir = path.dirname(config.databaseFile);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(config.databaseFile);

sqlite.pragma('journal_mode = WAL');

sqlite
  .prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_persona_id TEXT NOT NULL,
      original_text TEXT,
      original_locale TEXT,
      translated_text TEXT,
      translated_locale TEXT,
      tone_adjusted_text TEXT,
      translation_provider TEXT,
      audio_url TEXT,
      transcription_text TEXT,
      transcription_confidence REAL,
      message_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  .run();

try {
  sqlite.prepare('ALTER TABLE messages ADD COLUMN translation_provider TEXT;').run();
} catch (error) {
  if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
    throw error;
  }
}

sqlite
  .prepare(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      media_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
    );
  `)
  .run();

sqlite
  .prepare(`
    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
    );
  `)
  .run();

const messageSelect = sqlite.prepare(`
  SELECT
    id,
    sender_persona_id as senderPersonaId,
    original_text as originalText,
    original_locale as originalLocale,
    translated_text as translatedText,
    translated_locale as translatedLocale,
    tone_adjusted_text as toneAdjustedText,
    translation_provider as translationProvider,
    audio_url as audioUrl,
    transcription_text as transcriptionText,
    transcription_confidence as transcriptionConfidence,
    message_type as messageType,
    created_at as createdAt
  FROM messages
  ORDER BY datetime(created_at) DESC
  LIMIT @limit OFFSET @offset;
`);

const messageSelectById = sqlite.prepare(`
  SELECT
    id,
    sender_persona_id as senderPersonaId,
    original_text as originalText,
    original_locale as originalLocale,
    translated_text as translatedText,
    translated_locale as translatedLocale,
    tone_adjusted_text as toneAdjustedText,
    translation_provider as translationProvider,
    audio_url as audioUrl,
    transcription_text as transcriptionText,
    transcription_confidence as transcriptionConfidence,
    message_type as messageType,
    created_at as createdAt
  FROM messages
  WHERE id = @id;
`);

const attachmentsSelectByMessage = sqlite.prepare(`
  SELECT
    id,
    message_id as messageId,
    uri,
    mime_type as mimeType,
    media_type as mediaType,
    created_at as createdAt
  FROM attachments
  WHERE message_id = @messageId;
`);

const reactionsSelectByMessage = sqlite.prepare(`
  SELECT
    id,
    message_id as messageId,
    persona_id as personaId,
    emoji,
    created_at as createdAt
  FROM reactions
  WHERE message_id = @messageId;
`);

export interface MessageCreate {
  id: string;
  senderPersonaId: string;
  originalText: string | null;
  originalLocale: string | null;
  translatedText: string | null;
  translatedLocale: string | null;
  toneAdjustedText: string | null;
  translationProvider: string | null;
  audioUrl: string | null;
  transcriptionText: string | null;
  transcriptionConfidence: number | null;
  messageType: 'text' | 'voice' | 'media';
  createdAt: string;
}

export interface MessageVoiceUpdate {
  id: string;
  originalText: string | null;
  translatedText: string | null;
  translatedLocale: string | null;
  toneAdjustedText: string | null;
  translationProvider: string | null;
  transcriptionText: string | null;
  transcriptionConfidence: number | null;
}

export interface AttachmentCreate {
  id: string;
  messageId: string;
  uri: string;
  mimeType: string;
  mediaType: string;
  createdAt: string;
}

export interface ReactionCreate {
  id: string;
  messageId: string;
  personaId: string;
  emoji: string;
  createdAt: string;
}

export const messageRepository = {
  list(limit: number, offset: number): Message[] {
    const rows = messageSelect.all({ limit, offset }) as Message[];
    return rows.map((row) => ({
      ...row,
      media: attachmentsSelectByMessage.all({ messageId: row.id }) as Attachment[],
      reactions: reactionsSelectByMessage.all({ messageId: row.id }) as Reaction[],
    }));
  },
  get(id: string): Message | null {
    const row = messageSelectById.get({ id }) as Message | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      media: attachmentsSelectByMessage.all({ messageId: row.id }) as Attachment[],
      reactions: reactionsSelectByMessage.all({ messageId: row.id }) as Reaction[],
    };
  },
  create(message: MessageCreate): void {
    sqlite
      .prepare(`
        INSERT INTO messages (
          id,
          sender_persona_id,
          original_text,
          original_locale,
          translated_text,
          translated_locale,
          tone_adjusted_text,
          translation_provider,
          audio_url,
          transcription_text,
          transcription_confidence,
          message_type,
          created_at
        ) VALUES (@id, @senderPersonaId, @originalText, @originalLocale, @translatedText, @translatedLocale, @toneAdjustedText, @translationProvider, @audioUrl, @transcriptionText, @transcriptionConfidence, @messageType, @createdAt);
      `)
      .run(message);
  },
  updateAudioUrl(messageId: string, audioUrl: string): void {
    sqlite
      .prepare(`
        UPDATE messages SET audio_url = @audioUrl WHERE id = @messageId;
      `)
      .run({ audioUrl, messageId });
  },
  updateVoiceProcessing(update: MessageVoiceUpdate): void {
    sqlite
      .prepare(`
        UPDATE messages
        SET
          original_text = @originalText,
          translated_text = @translatedText,
          translated_locale = @translatedLocale,
          tone_adjusted_text = @toneAdjustedText,
          translation_provider = @translationProvider,
          transcription_text = @transcriptionText,
          transcription_confidence = @transcriptionConfidence
        WHERE id = @id;
      `)
      .run(update);
  },
  listReactions(messageId: string): Reaction[] {
    return reactionsSelectByMessage.all({ messageId }) as Reaction[];
  },
};

sqlite
  .prepare(`
    CREATE TABLE IF NOT EXISTS translation_provider_stats (
      provider TEXT PRIMARY KEY,
      selection_count INTEGER NOT NULL DEFAULT 0,
      total_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_selected_at TEXT
    );
  `)
  .run();

export interface TranslationProviderStat {
  provider: string;
  selectionCount: number;
  totalLatencyMs: number;
  lastSelectedAt: string | null;
}

const translationStatsUpsert = sqlite.prepare(`
  INSERT INTO translation_provider_stats (provider, selection_count, total_latency_ms, last_selected_at)
  VALUES (@provider, @selectionCount, @totalLatencyMs, @lastSelectedAt)
  ON CONFLICT(provider) DO UPDATE SET
    selection_count = translation_provider_stats.selection_count + excluded.selection_count,
    total_latency_ms = translation_provider_stats.total_latency_ms + excluded.total_latency_ms,
    last_selected_at = excluded.last_selected_at;
`);

const translationStatsSelect = sqlite.prepare(`
  SELECT
    provider,
    selection_count as selectionCount,
    total_latency_ms as totalLatencyMs,
    last_selected_at as lastSelectedAt
  FROM translation_provider_stats
  ORDER BY provider;
`);

export const translationAnalyticsRepository = {
  record(provider: string, latencyMs: number): void {
    const safeLatencyMs = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0;
    translationStatsUpsert.run({
      provider,
      selectionCount: 1,
      totalLatencyMs: safeLatencyMs,
      lastSelectedAt: new Date().toISOString(),
    });
  },
  list(): TranslationProviderStat[] {
    return translationStatsSelect.all() as TranslationProviderStat[];
  },
};

export const attachmentRepository = {
  create(attachment: AttachmentCreate): void {
    sqlite
      .prepare(`
        INSERT INTO attachments (id, message_id, uri, mime_type, media_type, created_at)
        VALUES (@id, @messageId, @uri, @mimeType, @mediaType, @createdAt);
      `)
      .run(attachment);
  },
  listByMessage(messageId: string): Attachment[] {
    return attachmentsSelectByMessage.all({ messageId }) as Attachment[];
  },
};

export const reactionRepository = {
  create(reaction: ReactionCreate): void {
    sqlite
      .prepare(`
        INSERT INTO reactions (id, message_id, persona_id, emoji, created_at)
        VALUES (@id, @messageId, @personaId, @emoji, @createdAt);
      `)
      .run(reaction);
  },
  listByMessage(messageId: string): Reaction[] {
    return reactionsSelectByMessage.all({ messageId }) as Reaction[];
  },
};
