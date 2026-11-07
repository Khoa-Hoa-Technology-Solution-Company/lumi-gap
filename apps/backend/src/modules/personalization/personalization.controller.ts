import type { Request, Response } from "express";
import type { ForYouQuery } from "@trend/shared-types";
import { personalizationService } from "./personalization.service.js";

export const personalizationController = {
  async interests(req: Request, res: Response) {
    res.json({ success: true, data: await personalizationService.interests(req.user!.sub) });
  },
  async vocabulary(req: Request, res: Response) {
    const { q } = req.query as unknown as { q: string };
    res.json({ success: true, data: await personalizationService.vocabulary(q) });
  },
  async follow(req: Request, res: Response) {
    await personalizationService.follow(req.user!.sub, req.body.topic);
    res.status(204).end();
  },
  async unfollow(req: Request, res: Response) {
    await personalizationService.unfollow(req.user!.sub, req.params.key as string);
    res.status(204).end();
  },
  async mute(req: Request, res: Response) {
    await personalizationService.mute(req.user!.sub, req.body.topic);
    res.status(204).end();
  },
  async unmute(req: Request, res: Response) {
    await personalizationService.unmute(req.user!.sub, req.params.key as string);
    res.status(204).end();
  },
  async communities(req: Request, res: Response) {
    res.json({ success: true, data: await personalizationService.communities(req.user!.sub) });
  },
  async forYou(req: Request, res: Response) {
    res.json({ success: true, data: await personalizationService.forYou(req.user!.sub, req.user!.role, (req.query as ForYouQuery).limit) });
  },
};
