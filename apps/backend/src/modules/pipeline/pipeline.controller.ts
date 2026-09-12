import type { Request, Response } from "express";
import { pipelineService } from "./pipeline.service.js";

export const pipelineController = {
  async status(_req: Request, res: Response) {
    const data = await pipelineService.getStatus();
    res.json({ success: true, data });
  },
};
