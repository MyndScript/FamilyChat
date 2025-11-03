import { Router, type Request, type Response } from 'express';

import { translationAnalyticsRepository, type TranslationProviderStat } from '../storage/database';

export interface TranslationProviderSummary {
  provider: string;
  selectionCount: number;
  averageLatencyMs: number | null;
  lastSelectedAt: string | null;
}

const buildProviderSummary = (): TranslationProviderSummary[] => {
  const stats = translationAnalyticsRepository.list();
  return stats.map((stat: TranslationProviderStat) => ({
    provider: stat.provider,
    selectionCount: stat.selectionCount,
    averageLatencyMs: stat.selectionCount > 0 ? Math.round(stat.totalLatencyMs / stat.selectionCount) : null,
    lastSelectedAt: stat.lastSelectedAt,
  }));
};

export const createTranslationAnalyticsRouter = () => {
  const router = Router();

  router.get('/translation-providers', (_req: Request, res: Response) => {
    const providers = buildProviderSummary();
    res.json({ providers });
  });

  return router;
};
