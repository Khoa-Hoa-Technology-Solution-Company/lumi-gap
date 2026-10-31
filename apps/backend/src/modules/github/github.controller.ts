import type { Request, Response } from "express";
import { githubService } from "./github.service.js";

export const githubController = {
  async status(req: Request, res: Response) { res.json({ success: true, data: await githubService.status(req.user!.sub) }); },
  async start(req: Request, res: Response) { res.json({ success: true, data: await githubService.start(req.user!.sub, req.user!.sessionId, req.body.returnTo) }); },
  async complete(req: Request, res: Response) { res.json({ success: true, data: await githubService.complete(req.user!.sub, req.user!.sessionId, req.body.code, req.body.state) }); },
  async repositories(req: Request, res: Response) { res.json({ success: true, data: await githubService.repositories(req.user!.sub, Number(req.query.page)) }); },
  async request(req: Request, res: Response) { res.json({ success: true, data: await githubService.request(req.user!.sub, req.body) }); },
  async createRepository(req: Request, res: Response) { res.status(201).json({ success: true, data: await githubService.createRepository(req.user!.sub, req.body) }); },
  async initializeRepository(req: Request, res: Response) { res.json({ success: true, data: await githubService.initializeRepository(req.user!.sub, req.body) }); },
  async disconnect(req: Request, res: Response) { res.json({ success: true, data: await githubService.disconnect(req.user!.sub) }); },
};
