import type { Request, Response } from "express";
import { analyticsService } from "./analytics.service.js";

export const analyticsController = {
  async summary(_req: Request, res: Response) {
    const data = await analyticsService.getSummary();
    res.json({ success: true, data });
  },

  async dashboard(req: Request, res: Response) {
    const rawDays = Number(req.query.days ?? 7);
    const days = Number.isNaN(rawDays) || rawDays < 1 ? 7 : Math.min(Math.floor(rawDays), 90);
    const [topQueries, volumeByDay] = await Promise.all([
      analyticsService.getTopQueries(days),
      analyticsService.getVolumeByDay(days),
    ]);
    res.json({ success: true, data: { topQueries, volumeByDay, days } });
  },

  async me(req: Request, res: Response) {
    const history = await analyticsService.getUserHistory(req.user!.sub);
    res.json({ success: true, data: history });
  },
};
