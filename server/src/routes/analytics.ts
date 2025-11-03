import { Router, type Request, type Response } from 'express';

import { translationAnalyticsRepository } from '../storage/database';

export const createAnalyticsRouter = () => {
  const router = Router();

  router.get('/translation-providers', (_req: Request, res: Response) => {
    const stats = translationAnalyticsRepository.list();
    const providers = stats.map((stat) => ({
      provider: stat.provider,
      selectionCount: stat.selectionCount,
      averageLatencyMs: stat.selectionCount > 0 ? Math.round(stat.totalLatencyMs / stat.selectionCount) : null,
      lastSelectedAt: stat.lastSelectedAt,
    }));

    res.json({ providers });
  });

  return router;
};
