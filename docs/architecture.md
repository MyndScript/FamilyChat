# Chat Khanavadegi – System Architecture

## 1. Product scope and experience goals
- **Audience:** Two fixed family members (Khadija \u2013 Farsi speaker, Brian \u2013 English speaker) using Android phones.
- **Mission:** Enable natural, affectionate, bilingual communication with minimal setup and no usernames/passwords.
- **Key differentiators:**
  - One-tap persona selection on first launch, remembered thereafter.
  - Automatic translation and culturally tuned tone for every message.
  - Voice-first experience for Khadija with auto playback of Farsi audio.
  - Audio-backed replies for Brian so he can hear original Farsi speech.
  - Lightweight media sharing (photos/videos) and emoji reactions.

## 2. User journeys
### Brian (English)
1. Opens the app, chooses **Brian** button once (persisted).
2. Sends typed English message or attaches media.
3. Message arrives translated to Farsi, with generated Farsi audio for Khadija.
4. Receives Khadija\'s voice reply as English text plus tappable Farsi audio clip.
5. Reacts to messages with emoji, listens to Farsi audio to learn language.

### Khadija (Farsi)
1. Opens the app, taps **\u062e\u062f\u06cc\u062c\u0647** button (persisted).
2. Hears Brian\'s message auto-played in warm Farsi voice, sees big microphone button.
3. Presses reply button, speaks in Farsi; app records, uploads, requests translation.
4. Translation result shows as simple card (optional), Brian receives English text and Khadija\'s audio.
5. Can react to messages with large, friendly emoji buttons.

## 3. System overview
```
┌───────────────┐      WebSocket (events)      ┌────────────────────┐
│ Android App   │◀────────────────────────────▶│   Server Gateway    │
│ (Jetpack      │                               │  (Express + WS)    │
│  Compose)     │      HTTPS REST (media)      │                    │
└───────────────┘───────────────┬──────────────└────────────────────┘
                                │
                                ▼
                     ┌───────────────────────┐
                     │ Message Orchestrator │
                     │  (translation, TTS,  │
                     │   STT pipelines)     │
                     └──────────┬────────────┘
                                │
        ┌──────────────┬────────┴────────────┬────────────────┐
        ▼              ▼                     ▼                ▼
┌─────────────┐ ┌──────────────┐     ┌────────────────┐ ┌────────────┐
│ SQLite DB   │ │ Media Store  │     │ Translation    │ │ Analytics  │
│ (Messages,  │ │ (local disk/ │     │ Adapter (Ollama│ │ (optional) │
│ Reactions)  │ │   S3, etc.)  │     │  or fallback)  │ │            │
└─────────────┘ └──────────────┘     └────────────────┘ └────────────┘
```

## 4. Key components
- **Android client (Kotlin + Jetpack Compose):**
  - Persona selector screen with persisted preference (DataStore).
  - Chat screen with `LazyColumn`, message bubbles, reaction bar, audio players.
  - Brian flow: text input, media picker, call `POST /messages`.
  - Khadija flow: voice recorder using `MediaRecorder`, upload to `POST /messages/voice`.
  - WebSocket client (OkHttp) for live message/reaction updates.
  - Auto playback using `MediaPlayer`, Farsi TTS fallback via Android `TextToSpeech` if audio missing.
  - Permissions: `RECORD_AUDIO`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `POST_NOTIFICATIONS` (for heads-up), `INTERNET`.

- **Server (Node.js + TypeScript + Express + Socket.IO):**
  - REST endpoints: persona registration, message submit (text/media/audio), reactions, media retrieval.
  - WebSocket events: `message:new`, `message:updated`, `reaction:new`, `presence:update`.
  - Pipeline orchestrator per message:
    - **TranslationAdapter** (default: HTTP call to configurable Ollama instance; fallback to Google Translate).
    - **TextToSpeechAdapter** (default: Google Cloud TTS; fallback to Coqui TTS or Android local TTS if configured).
    - **SpeechToTextAdapter** (default: Whisper/Ollama pipeline with `whisper-small` via `faster-whisper`; fallback to Google Speech).
  - Tone enhancer middleware: optional call to small LLM prompt to soften/love-s tone using conversation context before TTS.
  - Storage: SQLite (via Prisma) for messages, attachments, reactions; file storage on disk with pluggable S3 adapter.

- **Media handling:**
  - Upload route saves originals in `/storage/media/{messageId}/` with metadata in DB.
  - Generated Farsi audio stored similarly; clients stream via signed URL.
  - Voice replies keep original audio plus `wav` for consistent playback.

## 5. Data model (simplified)
- `UserPersona { id: "khadija"|"brian", displayName, locale }`
- `Message { id, senderPersonaId, originalText, translatedText, toneAdjustedText, audioUrl, mediaUrls[], createdAt }`
- `VoiceReply extends Message { originalAudioUrl, transcriptionText, transcriptionConfidence }`
- `Reaction { id, messageId, personaId, emoji, createdAt }`

## 6. API surface (initial)
- `POST /api/persona/activate` { personaId }
- `GET /api/messages` ?limit
- `POST /api/messages/text` { personaId, text, contextIds[] }
- `POST /api/messages/voice` multipart(form-data)
- `POST /api/messages/{id}/reactions` { emoji, personaId }
- `POST /api/media/upload` (for images/videos)
- WebSocket namespace `/ws/chat` events for push updates.

## 7. Translation & tone strategy
1. **Context gather:** fetch last N messages (configurable, default 5) for conversation context.
2. **Translation** via Ollama `ollama2persian` or fallback adapter.
3. **Tone refinement:** prompt small LLM with instructions for warm, loving tone; fallback to templated phrases.
4. **Validation loop:** optional scoring comparing back-translation to ensure semantic fidelity.
5. **Caching:** store translation+audio results; avoid duplicate work when message re-sent due to network retries.

## 8. Privacy & permissions
- No usernames/passwords; persona selection stored via encrypted SharedPreferences (DataStore Proto with AES).
- All traffic over HTTPS.
- Media stored with randomised filenames; audio clips accessible only via signed URLs.
- Android runtime permission flows with just-in-time explanations (recording, media library, notifications).
- Add privacy policy and runtime disclaimers clarifying translation/audio usage to satisfy Play Store policies.

## 9. Deployment & ops
- Docker container for server (Node 20 + FFmpeg + optional Whisper runtime).
- Optional GPU node for translation/whisper if self-hosted; environment variables configure remote APIs.
- Use pm2 or systemd for process management; S3-compatible storage recommended for media durability.
- Observability: Winston logging + OpenTelemetry traces; health check `GET /healthz`.

## 10. Roadmap
- v0: Text + voice messaging with translation/TTS pipeline, emoji reactions, local disk storage.
- v1: Cloud storage, push notifications, tone personalization, conversation analytics.
- v2: Offline caching, multi-device sync, interactive language learning prompts.
