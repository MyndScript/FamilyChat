export type PersonaId = 'khadija' | 'brian';

export interface Message {
  id: string;
  senderPersonaId: PersonaId;
  originalText: string | null;
  originalLocale: 'en' | 'fa' | null;
  translatedText: string | null;
  translatedLocale: 'en' | 'fa' | null;
  toneAdjustedText: string | null;
  translationProvider: 'ollama' | 'google' | 'unknown' | null;
  audioUrl: string | null;
  transcriptionText: string | null;
  transcriptionConfidence: number | null;
  media: Attachment[];
  reactions: Reaction[];
  createdAt: string;
  messageType: 'text' | 'voice' | 'media';
}

export interface Attachment {
  id: string;
  messageId: string;
  uri: string;
  mimeType: string;
  mediaType: 'image' | 'video' | 'audio';
  createdAt: string;
}

export interface Reaction {
  id: string;
  messageId: string;
  personaId: PersonaId;
  emoji: string;
  createdAt: string;
}

export interface TranslationResult {
  translatedText: string;
  toneAdjustedText: string;
  locale: 'fa' | 'en';
  provider: 'ollama' | 'google' | 'unknown';
}

export interface SpeechToTextResult {
  transcriptionText: string;
  confidence: number;
  locale: 'en' | 'fa';
}
