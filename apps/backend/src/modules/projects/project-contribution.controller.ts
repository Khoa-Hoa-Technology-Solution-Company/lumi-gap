import type { Request, Response } from "express";
import { z } from "zod";
import { projectContributionService } from "./project-contribution.service.js";

const projectContributionRoles = [
  "SUPERVISION", "METHODOLOGY", "VALIDATION", "SOFTWARE", "CONCEPTUALIZATION",
  "WRITING_ORIGINAL_DRAFT", "WRITING_REVIEW_EDITING", "PROJECT_ADMINISTRATION", "OTHER",
] as const;
const databaseId = z.string().refine(
  (value) => /^[0-9a-fA-F]{24}$/.test(value) || /^[0-9a-fA-F-]{36}$/.test(value),
  "Invalid identifier format",
);

export const contributionProposalParamsSchema = z.object({
  id: databaseId,
  proposalId: databaseId,
});

export const proposeContributionSchema = z.object({
  contributorId: databaseId,
  roles: z.array(z.enum(projectContributionRoles)).min(1).max(projectContributionRoles.length)
    .refine((roles) => new Set(roles).size === roles.length, "Contribution roles must be unique"),
  description: z.string().trim().min(20).max(5000),
  evidence: z.string().trim().max(5000).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
}).strict();

export const resolveContributionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
}).strict();

export const projectContributionController = {
  async list(req: Request, res: Response) {
    const data = await projectContributionService.list(req.params.id as string, req.user!.sub, req.user!.role);
    res.json({ success: true, data });
  },

  async propose(req: Request, res: Response) {
    const data = await projectContributionService.propose(req.params.id as string, req.user!.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async confirm(req: Request, res: Response) {
    const data = await projectContributionService.confirm(
      req.params.id as string,
      req.params.proposalId as string,
      req.user!.sub,
      req.body,
    );
    res.json({ success: true, data });
  },

  async reject(req: Request, res: Response) {
    const data = await projectContributionService.reject(
      req.params.id as string,
      req.params.proposalId as string,
      req.user!.sub,
      req.body,
    );
    res.json({ success: true, data });
  },
};
