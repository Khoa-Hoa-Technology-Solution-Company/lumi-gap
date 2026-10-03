import type { Request, Response } from "express";
import { homeService } from "./home.service.js";
import { getResearchHome } from "./home-research.service.js";

export const homeController = {
  async research(req: Request, res: Response) {
    const data = await getResearchHome(req.user!);
    res.json({ success: true, data });
  },
  async overview(req: Request, res: Response) {
    const data = await homeService.getOverview(req.user);
    res.json({ success: true, data });
  },
};
