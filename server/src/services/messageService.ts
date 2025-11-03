import path from 'node:path';

import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { attachmentRepository, messageRepository, reactionRepository } from '../storage/database';
import { Attachment, Message, PersonaId, Reaction } from '../types/message';
import { logger } from '../utils/logger';
import { translationService } from './translationService';
import { speechToTextService } from './speechToTextService';

interface CreateTextMessageParams {
  personaId: PersonaId;
  text: string;
  contextMessages?: Message[];
}

interface CreateVoiceMessageParams {
  personaId: PersonaId;
  audioFilename: string;
  originalLocale: 'fa' | 'en';
  contextMessages?: Message[];
}

type VoiceMessageUpdateCallback = (message: Message) => void | Promise<void>;

interface CreateMediaMessageParams {
  personaId: PersonaId;
  files: { filename: string; mimeType: string; mediaType: 'image' | 'video' | 'audio' }[];
  caption?: string;
}

export class MessageService {
  async listMessages(limit = 50, offset = 0): Promise<Message[]> {
    return messageRepository.list(limit, offset);
  }

  async createTextMessage({ personaId, text, contextMessages = [] }: CreateTextMessageParams): Promise<Message> {
    const id = uuid();
    const createdAt = new Date().toISOString();

    const direction = personaId === 'brian' ? 'en-to-fa' : 'fa-to-en';
    const originalLocale: 'en' | 'fa' = direction === 'en-to-fa' ? 'en' : 'fa';
    const context = contextMessages.map((msg) => msg.toneAdjustedText ?? msg.translatedText ?? msg.originalText ?? '');
    const translation = await translationService.translate(text, direction, context);
    logger.debug({ messageId: id, direction, provider: translation.provider }, 'text message translated');

    const messageRecord = {
      id,
      senderPersonaId: personaId,
      originalText: text,
      originalLocale,
      translatedText: translation.translatedText,
      translatedLocale: translation.locale,
      toneAdjustedText: translation.toneAdjustedText,
      translationProvider: translation.provider ?? 'unknown',
      audioUrl: null,
      transcriptionText: null,
      transcriptionConfidence: null,
      messageType: 'text' as const,
      createdAt,
    };

    messageRepository.create(messageRecord);

    return {
      ...messageRecord,
      media: [],
      reactions: [],
    };
  }

  async createVoiceMessage({
    personaId,
    audioFilename,
    originalLocale,
    contextMessages = [],
  }: CreateVoiceMessageParams, onUpdate?: VoiceMessageUpdateCallback): Promise<Message> {
    const id = uuid();
    const createdAt = new Date().toISOString();
    const audioUrl = this.toPublicUrl(audioFilename);

    const messageRecord = {
      id,
      senderPersonaId: personaId,
      originalText: null,
      originalLocale,
      translatedText: null,
      translatedLocale: null,
      toneAdjustedText: null,
      translationProvider: null,
      audioUrl,
      transcriptionText: null,
      transcriptionConfidence: null,
      messageType: 'voice' as const,
      createdAt,
    };

    messageRepository.create(messageRecord);

    const attachmentId = uuid();
    attachmentRepository.create({
      id: attachmentId,
      messageId: id,
      uri: audioUrl,
      mimeType: 'audio/m4a',
      mediaType: 'audio',
      createdAt,
    });

    const initialMessage: Message = {
      ...messageRecord,
      media: [
        {
          id: attachmentId,
          messageId: id,
          uri: audioUrl,
          mimeType: 'audio/m4a',
          mediaType: 'audio',
          createdAt,
        },
      ],
      translationProvider: null,
      reactions: [],
    };

    void this.processVoiceMessage({
      messageId: id,
      audioFilename,
      originalLocale,
      contextMessages,
      onUpdate,
    });

    return initialMessage;
  }

  async createMediaMessage({ personaId, files, caption }: CreateMediaMessageParams): Promise<Message> {
    const id = uuid();
    const createdAt = new Date().toISOString();
    const originalLocale: 'en' | 'fa' | null = caption ? (personaId === 'brian' ? 'en' : 'fa') : null;

    const attachments: Attachment[] = files.map((file) => {
      const attachmentId = uuid();
      const uri = this.toPublicUrl(file.filename);
      attachmentRepository.create({
        id: attachmentId,
        messageId: id,
        uri,
        mimeType: file.mimeType,
        mediaType: file.mediaType,
        createdAt,
      });
      return {
        id: attachmentId,
        messageId: id,
        uri,
        mimeType: file.mimeType,
        mediaType: file.mediaType,
        createdAt,
      };
    });

    const messageRecord = {
      id,
      senderPersonaId: personaId,
      originalText: caption ?? null,
      originalLocale,
      translatedText: null,
      translatedLocale: null,
      toneAdjustedText: null,
    translationProvider: null,
      audioUrl: null,
      transcriptionText: null,
      transcriptionConfidence: null,
      messageType: 'media' as const,
      createdAt,
    };

    messageRepository.create(messageRecord);

    return {
      ...messageRecord,
      media: attachments,
      reactions: [],
    };
  }

  async addReaction(messageId: string, personaId: PersonaId, emoji: string): Promise<Reaction> {
    const id = uuid();
    const createdAt = new Date().toISOString();
    const reaction: Reaction = { id, messageId, personaId, emoji, createdAt };
    reactionRepository.create({ id, messageId, personaId, emoji, createdAt });
    return reaction;
  }

  private toPublicUrl(filename: string): string {
    const relative = path.relative(config.mediaRoot, filename);
    return `/media/${relative.replace(/\\/g, '/')}`;
  }

  private async processVoiceMessage({
    messageId,
    audioFilename,
    originalLocale,
    contextMessages,
    onUpdate,
  }: {
    messageId: string;
    audioFilename: string;
    originalLocale: 'fa' | 'en';
    contextMessages: Message[];
    onUpdate?: VoiceMessageUpdateCallback;
  }): Promise<void> {
    try {
      const transcription = await speechToTextService.transcribe(audioFilename, originalLocale);

      const transcriptionText = transcription?.transcriptionText ?? null;
      const transcriptionConfidence = transcription?.confidence ?? null;

      let translatedText: string | null = null;
      let translatedLocale: 'fa' | 'en' | null = null;
      let toneAdjustedText: string | null = null;
      let translationProvider: 'ollama' | 'google' | 'unknown' | null = null;

      if (transcriptionText) {
        const direction = originalLocale === 'fa' ? 'fa-to-en' : 'en-to-fa';
        const context = contextMessages.map((msg) => msg.toneAdjustedText ?? msg.translatedText ?? msg.originalText ?? '');
        const translation = await translationService.translate(transcriptionText, direction, context);
        translatedText = translation.translatedText;
        translatedLocale = translation.locale;
        toneAdjustedText = translation.toneAdjustedText;
        translationProvider = translation.provider ?? 'unknown';
        logger.debug({ messageId, direction, provider: translation.provider }, 'voice message translated');
      }

      messageRepository.updateVoiceProcessing({
        id: messageId,
        originalText: transcriptionText,
        translatedText,
        translatedLocale,
        toneAdjustedText,
        translationProvider,
        transcriptionText,
        transcriptionConfidence,
      });

      const updated = messageRepository.get(messageId);
      if (updated && onUpdate) {
        await onUpdate(updated);
      }
    } catch (error) {
      logger.error({ err: error, messageId }, 'voice message post-processing failed');
    }
  }
}

export const messageService = new MessageService();
