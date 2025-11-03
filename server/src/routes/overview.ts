import { Router, type Request, type Response } from 'express';

const overviewPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conversation Overview - Chat Khanavadegi</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background-color: #0f172a;
      color: #e2e8f0;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: radial-gradient(circle at top, rgba(79, 70, 229, 0.35), transparent 60%);
    }
    header {
      padding: 1.5rem 2rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.3);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    header h1 {
      margin: 0;
      font-size: 1.6rem;
    }
    header span {
      font-size: 0.9rem;
      color: #94a3b8;
    }
    main {
      flex: 1;
      padding: 1.5rem 2rem 3rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .message-card {
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 1rem;
      padding: 1rem 1.25rem;
      background: rgba(15, 23, 42, 0.75);
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.35);
      backdrop-filter: blur(8px);
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
      color: #cbd5f5;
    }
    .message-original {
      font-size: 1.1rem;
      margin: 0 0 0.5rem;
      color: #f8fafc;
    }
    .section-title {
      margin: 0.75rem 0 0.35rem;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #818cf8;
    }
    .message-translation,
    .message-toned,
    .message-transcription {
      margin: 0;
      color: #e2e8f0;
      line-height: 1.4;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 0.75rem;
      font-size: 0.8rem;
      color: #a5b4fc;
    }
    .meta-row span {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .media-list,
    .reaction-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0.5rem 0 0;
      padding: 0;
      list-style: none;
    }
    .media-list a {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.25);
      color: #bfdbfe;
      text-decoration: none;
      font-size: 0.8rem;
    }
    .reaction-list li {
      background: rgba(236, 72, 153, 0.2);
      color: #fbcfe8;
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      font-size: 0.85rem;
    }
    .status {
      color: #fbbf24;
      font-size: 0.85rem;
    }
    .status.error {
      color: #f87171;
    }
    .empty-state {
      margin-top: 3rem;
      text-align: center;
      color: #94a3b8;
      font-size: 1rem;
    }
    @media (max-width: 768px) {
      header, main {
        padding: 1.25rem;
      }
    }
  </style>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <header>
    <h1>Conversation Overview</h1>
    <span id="status" class="status">Connecting...</span>
  </header>
  <main>
    <div id="messages" class="messages" role="feed" aria-live="polite"></div>
    <div id="empty" class="empty-state" hidden>No messages yet. New activity will show up here.</div>
  </main>
  <script>
    (function () {
      const container = document.getElementById('messages');
      const emptyState = document.getElementById('empty');
      const statusEl = document.getElementById('status');
      statusEl.textContent = 'Initializing…';
      const state = new Map();

      function formatPersona(personaId) {
        if (!personaId) {
          return 'Unknown';
        }
        return personaId.charAt(0).toUpperCase() + personaId.slice(1);
      }

      function formatTime(iso) {
        try {
          return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
        } catch (error) {
          return iso || '';
        }
      }

      function ensureEmptyState() {
        emptyState.hidden = state.size > 0;
      }

      function renderReactionList(message) {
        const list = document.createElement('ul');
        list.className = 'reaction-list';
        if (!message.reactions || message.reactions.length === 0) {
          return list;
        }
        message.reactions.forEach(function (reaction) {
          const item = document.createElement('li');
          item.textContent = reaction.emoji + ' - ' + formatPersona(reaction.personaId);
          list.appendChild(item);
        });
        return list;
      }

      function renderMediaChips(message) {
        const list = document.createElement('ul');
        list.className = 'media-list';
        if (!message.media || message.media.length === 0) {
          return list;
        }
        message.media.forEach(function (media, index) {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = media.uri;
          link.target = '_blank';
          link.rel = 'noreferrer noopener';
          link.textContent = media.mediaType.toUpperCase() + ' #' + (index + 1);
          item.appendChild(link);
          list.appendChild(item);
        });
        return list;
      }

      function buildMessageCard(message) {
        const article = document.createElement('article');
        article.className = 'message-card';
        article.dataset.messageId = message.id;

        const headerEl = document.createElement('div');
        headerEl.className = 'message-header';
        const persona = document.createElement('strong');
        persona.textContent = formatPersona(message.senderPersonaId) + ' - ' + message.messageType.toUpperCase();
        const created = document.createElement('span');
        created.textContent = formatTime(message.createdAt);
        headerEl.appendChild(persona);
        headerEl.appendChild(created);
        article.appendChild(headerEl);

        const original = document.createElement('p');
        original.className = 'message-original';
        if (message.originalText) {
          original.textContent = message.originalText;
        } else if (message.messageType === 'voice') {
          original.textContent = 'Voice message (awaiting transcription)';
        } else {
          original.textContent = 'No original text';
        }
        article.appendChild(original);

        if (message.translatedText) {
          const translatedLabel = document.createElement('p');
          translatedLabel.className = 'section-title';
          translatedLabel.textContent = 'Translated';
          article.appendChild(translatedLabel);

          const translated = document.createElement('p');
          translated.className = 'message-translation';
          translated.textContent = message.translatedText;
          article.appendChild(translated);
        }

        if (message.toneAdjustedText && message.toneAdjustedText !== message.translatedText) {
          const toneLabel = document.createElement('p');
          toneLabel.className = 'section-title';
          toneLabel.textContent = 'Tone Adjusted';
          article.appendChild(toneLabel);

          const tone = document.createElement('p');
          tone.className = 'message-toned';
          tone.textContent = message.toneAdjustedText;
          article.appendChild(tone);
        }

        if (message.transcriptionText) {
          const transcriptionLabel = document.createElement('p');
          transcriptionLabel.className = 'section-title';
          transcriptionLabel.textContent = 'Transcription';
          article.appendChild(transcriptionLabel);

          const transcription = document.createElement('p');
          transcription.className = 'message-transcription';
          transcription.textContent = message.transcriptionText;
          article.appendChild(transcription);
        }

        if (message.audioUrl) {
          const audioLink = document.createElement('a');
          audioLink.href = message.audioUrl;
          audioLink.target = '_blank';
          audioLink.rel = 'noreferrer noopener';
          audioLink.textContent = 'Open original audio clip';
          article.appendChild(audioLink);
        }

        const metaRow = document.createElement('div');
        metaRow.className = 'meta-row';
        if (message.translationProvider) {
          const provider = document.createElement('span');
          provider.textContent = 'Translation: ' + message.translationProvider;
          metaRow.appendChild(provider);
        }
        if (message.translatedLocale) {
          const locale = document.createElement('span');
          locale.textContent = 'Locale: ' + message.translatedLocale;
          metaRow.appendChild(locale);
        }
        if (typeof message.transcriptionConfidence === 'number') {
          const confidence = document.createElement('span');
          const pct = Math.round(message.transcriptionConfidence * 100);
          confidence.textContent = 'Transcription confidence: ' + pct + '%';
          metaRow.appendChild(confidence);
        }
        if (metaRow.childNodes.length > 0) {
          article.appendChild(metaRow);
        }

        const mediaSection = renderMediaChips(message);
        if (mediaSection.childNodes.length > 0) {
          const mediaLabel = document.createElement('p');
          mediaLabel.className = 'section-title';
          mediaLabel.textContent = 'Attachments';
          article.appendChild(mediaLabel);
          article.appendChild(mediaSection);
        }

        const reactions = renderReactionList(message);
        if (reactions.childNodes.length > 0) {
          const reactionLabel = document.createElement('p');
          reactionLabel.className = 'section-title';
          reactionLabel.textContent = 'Reactions';
          article.appendChild(reactionLabel);
          article.appendChild(reactions);
        }

        return article;
      }

      function upsertMessage(message) {
        state.set(message.id, message);
        const existing = container.querySelector('[data-message-id="' + message.id + '"]');
        const card = buildMessageCard(message);
        if (existing && existing.parentElement) {
          existing.parentElement.replaceChild(card, existing);
        } else {
          container.insertBefore(card, container.firstChild);
        }
        ensureEmptyState();
      }

      function handleReaction(reaction) {
        const current = state.get(reaction.messageId);
        if (!current) {
          return;
        }
        const reactions = (current.reactions || []).slice();
        reactions.push(reaction);
        const updated = Object.assign({}, current, { reactions: reactions });
        upsertMessage(updated);
      }

      async function loadInitial() {
        try {
          statusEl.textContent = 'Loading history…';
          const response = await fetch('/api/messages?limit=100');
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          const payload = await response.json();
          const messages = (payload.messages || []).slice().reverse();
          messages.forEach(function (message) {
            upsertMessage(message);
          });
          statusEl.textContent = 'History loaded';
        } catch (error) {
          statusEl.textContent = 'Failed to load messages';
          statusEl.classList.add('error');
        } finally {
          ensureEmptyState();
        }
      }

      function connectSocket() {
        try {
          const socket = io();
          socket.on('connect', function () {
            statusEl.textContent = 'Live updates active';
            statusEl.classList.remove('error');
          });
          socket.on('disconnect', function () {
            statusEl.textContent = 'Realtime disconnected';
            statusEl.classList.add('error');
          });
          socket.on('message:new', function (message) {
            upsertMessage(message);
          });
          socket.on('message:updated', function (message) {
            upsertMessage(message);
          });
          socket.on('reaction:new', function (reaction) {
            handleReaction(reaction);
          });
        } catch (error) {
          statusEl.textContent = 'Socket unavailable';
          statusEl.classList.add('error');
        }
      }

      loadInitial();
      connectSocket();
    })();
  </script>
</body>
</html>`;

const router = Router();

const renderOverviewPage = (_req: Request, res: Response) => {
  res.type('text/html; charset=utf-8').send(overviewPage);
};

router.get('/', renderOverviewPage);

export { router as overviewRouter };
