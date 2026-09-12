import type { Request, Response } from "express";
import { homeService } from "./home.service.js";

export const homeController = {
  async overview(req: Request, res: Response) {
    const data = await homeService.getOverview(req.user);
    res.json({ success: true, data });
  },
};
