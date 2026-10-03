import type { Request, Response } from "express";
import type { CommunityListQuery } from "./dto/community.schema.js";
import { communityRelatedService } from "./community-related.service.js";
import { communitySummaryService } from "./community-summary.service.js";
import { communityService } from "./community.service.js";

export const communityController = {
  async list(req: Request, res: Response) {
    res.json({ success: true, ...(await communityService.list(req.user?.sub, req.query as unknown as CommunityListQuery, req.user?.role)) });
  },

  async facets(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.facets(req.user?.sub, req.user?.role) });
  },

  async recommendations(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.recommend(req.user!.sub) });
  },

  async create(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await communityService.create(req.body, req.user!) });
  },

  async get(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.get(req.params.idOrSlug as string, req.user?.sub, req.user?.role) });
  },

  async update(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.update(req.params.id as string, req.body, req.user!.sub, req.user!.role) });
  },

  async setStatus(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.setStatus(req.params.id as string, req.body.status, req.user!.sub, req.user!.role) });
  },

  async resubmit(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.resubmit(req.params.id as string, req.user!.sub, req.user!.role) });
  },

  async transferOwnership(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.transferOwnership(req.params.id as string, req.body.userId, req.user!.sub, req.user!.role) });
  },

  async publicMembers(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.publicMembers(req.params.id as string, req.user?.sub, req.user?.role) });
  },

  async relatedPapers(req: Request, res: Response) {
    res.json({ success: true, data: await communityRelatedService.papers(req.params.id as string, req.user?.sub, req.user?.role) });
  },

  async relatedGaps(req: Request, res: Response) {
    res.json({ success: true, data: await communityRelatedService.gaps(req.params.id as string, req.user?.sub, req.user?.role) });
  },

  async review(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.review(req.params.id as string, req.body, req.user!.sub, req.user!.role) });
  },

  async join(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.join(req.params.id as string, req.user!.sub) });
  },

  async leave(req: Request, res: Response) {
    await communityService.leave(req.params.id as string, req.user!.sub);
    res.json({ success: true, data: { deleted: true } });
  },

  async requestSummary(req: Request, res: Response) {
    const data = await communitySummaryService.request(req.params.id as string, req.user!.sub, req.user!.role);
    res.status(data.status === "completed" ? 200 : 202).json({ success: true, data });
  },

  async summaryStatus(req: Request, res: Response) {
    res.json({ success: true, data: await communitySummaryService.status(req.params.id as string, req.user!.sub, req.user!.role) });
  },

  async listMembers(req: Request, res: Response) {
    res.json({ success: true, data: await communityService.listMembers(req.params.id as string, req.user!.sub, req.user!.role) });
  },

  async updateMember(req: Request, res: Response) {
    res.json({
      success: true,
      data: await communityService.updateMember(req.params.id as string, req.params.userId as string, req.body, req.user!.sub, req.user!.role),
    });
  },
};
