import fs from 'node:fs';
import path from 'node:path';

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { type DiskStorageOptions } from 'multer';
import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';

import { config } from '../config';
import { messageService } from '../services/messageService';
import { logger } from '../utils/logger';

const ensureMediaDir = () => {
  if (!fs.existsSync(config.mediaRoot)) {
    fs.mkdirSync(config.mediaRoot, { recursive: true });
  }
};

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

const storageOptions: DiskStorageOptions = {
  destination: (_req: Request, _file: MulterFile, cb: (error: Error | null, destination: string) => void) => {
    ensureMediaDir();
    cb(null, config.mediaRoot);
  },
  filename: (_req: Request, file: MulterFile, cb: (error: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${uuid()}${ext}`);
  },
};

const storage = multer.diskStorage(storageOptions);

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 6,
  },
});

const textMessageSchema = z.object({
  personaId: z.enum(['khadija', 'brian']),
  text: z.string().min(1).max(4000),
});

const reactionSchema = z.object({
  personaId: z.enum(['khadija', 'brian']),
  emoji: z.string().min(1).max(8),
});

interface UploadedFile {
  path: string;
  mimetype: string;
  originalname: string;
}

export const createMessagesRouter = (io: Server) => {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      const messages = await messageService.listMessages(limit, offset);
      res.json({ messages });
    } catch (error) {
      next(error);
    }
  });

  router.post('/text', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = textMessageSchema.parse(req.body);
      const recent = await messageService.listMessages(5, 0);
      const message = await messageService.createTextMessage({
        personaId: parsed.personaId,
        text: parsed.text,
        contextMessages: recent,
      });
      io.emit('message:new', message);
      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/voice',
    upload.single('audio'),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
      const personaId = req.body.personaId as 'khadija' | 'brian';
      if (!personaId || (personaId !== 'khadija' && personaId !== 'brian')) {
        return res.status(400).json({ error: 'personaId is required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'audio file missing' });
      }

      logger.info({ personaId, file: req.file.filename }, 'received voice message');

      const recent = await messageService.listMessages(5, 0);
      const message = await messageService.createVoiceMessage({
        personaId,
        audioFilename: req.file.path,
        originalLocale: personaId === 'khadija' ? 'fa' : 'en',
        contextMessages: recent,
      }, async (updated) => {
        io.emit('message:updated', updated);
      });

      io.emit('message:new', message);
      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
    },
  );

  router.post(
    '/media',
    upload.array('files'),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
      const personaId = req.body.personaId as 'khadija' | 'brian';
      if (!personaId || (personaId !== 'khadija' && personaId !== 'brian')) {
        return res.status(400).json({ error: 'personaId is required' });
      }

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: 'files missing' });
      }

        const files = (req.files as UploadedFile[]).map((file) => ({
          filename: file.path,
          mimeType: file.mimetype,
          mediaType: file.mimetype.startsWith('video')
            ? 'video'
            : file.mimetype.startsWith('audio')
            ? 'audio'
            : 'image',
        })) as {
        filename: string;
        mimeType: string;
        mediaType: 'image' | 'video' | 'audio';
      }[];

      const message = await messageService.createMediaMessage({
        personaId,
        files,
        caption: typeof req.body.caption === 'string' ? req.body.caption : undefined,
      });

      io.emit('message:new', message);
      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
    },
  );

  router.post('/:messageId/reactions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = req.params;
      const parsed = reactionSchema.parse(req.body);
      const reaction = await messageService.addReaction(messageId, parsed.personaId, parsed.emoji);
      io.emit('reaction:new', reaction);
      res.status(201).json({ reaction });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
