import type { Request, Response } from "express";
import { evaluationService } from "./evaluation.service.js";

export const evaluationController = {
  async summary(_req: Request, res: Response) {
    const data = await evaluationService.getSummary();
    res.json({ success: true, data });
  },
};
