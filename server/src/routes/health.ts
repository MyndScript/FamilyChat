import { Router, type Request, type Response } from 'express';

export const createHealthRouter = () => {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
};
