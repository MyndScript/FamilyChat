import { Router, type Request, type Response, type NextFunction } from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';

const personaSchema = z.object({
  personaId: z.enum(['khadija', 'brian']),
});

export const createPersonaRouter = (io: Server) => {
  const router = Router();

  router.post('/activate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = personaSchema.parse(req.body);
      io.emit('presence:update', { personaId: parsed.personaId, status: 'online' });
      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
