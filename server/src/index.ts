import fs from 'node:fs';
import http from 'node:http';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server, type Socket } from 'socket.io';

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { createHealthRouter } from './routes/health';
import { createMessagesRouter } from './routes/messages';
import { createPersonaRouter } from './routes/persona';
import { createTranslationAnalyticsRouter } from './routes/translationAnalytics';
import { overviewRouter } from './routes/overview';
import { logger } from './utils/logger';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.clientOrigin,
    methods: ['GET', 'POST'],
  },
});

if (!fs.existsSync(config.mediaRoot)) {
  fs.mkdirSync(config.mediaRoot, { recursive: true });
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", "'unsafe-inline'"],
        'connect-src': ["'self'", 'ws:', 'wss:'],
      },
    },
  }),
);
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('tiny'));
app.use('/media', express.static(config.mediaRoot));

app.use('/healthz', createHealthRouter());
app.use('/api/messages', createMessagesRouter(io));
app.use('/api/persona', createPersonaRouter(io));
app.use('/api/analytics', createTranslationAnalyticsRouter());
app.use('/overview', overviewRouter);

app.use(errorHandler);

io.on('connection', (socket: Socket) => {
  logger.info({ id: socket.id }, 'socket connected');
  socket.on('disconnect', () => {
    logger.info({ id: socket.id }, 'socket disconnected');
  });
});

server.listen(config.port, config.host, () => {
  logger.info({ port: config.port, host: config.host }, 'chat server ready');
});
