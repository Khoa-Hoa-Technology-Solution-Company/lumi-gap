import type { Request, Response } from "express";
import { projectOverviewService as overview } from "./project-overview.service.js";
import { projectPlanService as plan } from "./project-plan.service.js";
import { projectPlanDraftService as draft } from "./project-plan-draft.service.js";
import { projectPlanFeedbackService as feedback } from "./project-plan-feedback.service.js";
import { projectTasksService as tasks } from "./project-tasks.service.js";
import { projectDiscussionsService as discussions } from "./project-discussions.service.js";
import { artifactQuerySchema, commentQuerySchema, discussionQuerySchema, planQuerySchema, planThreadsQuerySchema, taskQuerySchema, taskBoardQuerySchema, workspacePageSchema } from "./dto/project-workspace.schema.js";

const id = (req: Request) => String(req.params.id);
const item = (req: Request) => String(req.params.itemId);
const actor = (req: Request) => req.user!.sub;
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
export const projectWorkspaceController = {
  overview: async (req: Request, res: Response) => send(res, await overview.get(id(req), actor(req))),
  stage: async (req: Request, res: Response) => send(res, await overview.stage(id(req), actor(req), req.body)),
  people: async (req: Request, res: Response) => { const query = discussionQuerySchema.parse(req.query); return send(res, await overview.people(id(req), actor(req), query)); },
  artifacts: async (req: Request, res: Response) => { const query = artifactQuerySchema.parse(req.query); return send(res, await overview.artifacts(id(req), actor(req), query.kind, query.q)); },
  artifactHref: async (req: Request, res: Response) => send(res, await overview.artifactHref(id(req), actor(req), { kind: artifactQuerySchema.parse(req.query).kind, id: item(req) })),
  plan: async (req: Request, res: Response) => send(res, await plan.get(id(req), actor(req), planQuerySchema.parse(req.query).revisionId)),
  savePlan: async (req: Request, res: Response) => send(res, await plan.save(id(req), actor(req), req.body)),
  updatePlanDraft: async (req: Request, res: Response) => send(res, await draft.update(id(req), actor(req), req.body)),
  snapshotPlan: async (req: Request, res: Response) => send(res, await draft.snapshot(id(req), actor(req), req.body), 201),
  restorePlan: async (req: Request, res: Response) => send(res, await draft.restore(id(req), actor(req), item(req), req.body)),
  planThreads: async (req: Request, res: Response) => send(res, await feedback.list(id(req), actor(req), planThreadsQuerySchema.parse(req.query))),
  createPlanThread: async (req: Request, res: Response) => send(res, await feedback.create(id(req), actor(req), req.body), 201),
  planRevisions: async (req: Request, res: Response) => send(res, await plan.revisions(id(req), actor(req), workspacePageSchema.parse(req.query))),
  planShares: async (req: Request, res: Response) => send(res, await plan.shares(id(req), actor(req))),
  sharePlan: async (req: Request, res: Response) => send(res, await plan.share(id(req), actor(req), req.body), 201),
  revokeShare: async (req: Request, res: Response) => send(res, await plan.revokeShare(id(req), actor(req), item(req))),
  tasks: async (req: Request, res: Response) => send(res, await tasks.list(id(req), actor(req), taskQuerySchema.parse(req.query))),
  taskBoard: async (req: Request, res: Response) => send(res, await tasks.board(id(req), actor(req), taskBoardQuerySchema.parse(req.query))),
  moveTask: async (req: Request, res: Response) => send(res, await tasks.move(id(req), actor(req), item(req), req.body)),
  task: async (req: Request, res: Response) => send(res, await tasks.detail(id(req), actor(req), item(req), workspacePageSchema.parse(req.query))),
  createTask: async (req: Request, res: Response) => send(res, await tasks.save(id(req), actor(req), req.body), 201),
  updateTask: async (req: Request, res: Response) => send(res, await tasks.save(id(req), actor(req), req.body, item(req))),
  deleteTask: async (req: Request, res: Response) => send(res, await tasks.remove(id(req), actor(req), item(req), req.body.expectedVersion)),
  milestones: async (req: Request, res: Response) => send(res, await tasks.milestones(id(req), actor(req), workspacePageSchema.parse(req.query))),
  createMilestone: async (req: Request, res: Response) => send(res, await tasks.saveMilestone(id(req), actor(req), req.body), 201),
  updateMilestone: async (req: Request, res: Response) => send(res, await tasks.saveMilestone(id(req), actor(req), req.body, item(req))),
  comments: async (req: Request, res: Response) => { const query = commentQuerySchema.parse(req.query); return send(res, await tasks.comments(id(req), actor(req), query.targetKind, query.targetId, query)); },
  addComment: async (req: Request, res: Response) => send(res, await tasks.addComment(id(req), actor(req), req.body), 201),
  discussions: async (req: Request, res: Response) => send(res, await discussions.list(id(req), actor(req), discussionQuerySchema.parse(req.query))),
  discussion: async (req: Request, res: Response) => send(res, await discussions.detail(id(req), actor(req), item(req), workspacePageSchema.parse(req.query))),
  createDiscussion: async (req: Request, res: Response) => send(res, await discussions.save(id(req), actor(req), req.body), 201),
  updateDiscussion: async (req: Request, res: Response) => send(res, await discussions.save(id(req), actor(req), req.body, item(req))),
  reply: async (req: Request, res: Response) => send(res, await discussions.reply(id(req), actor(req), item(req), req.body), 201),
  resolve: async (req: Request, res: Response) => send(res, await discussions.resolve(id(req), actor(req), item(req), req.body)),
  discussionHistory: async (req: Request, res: Response) => send(res, await discussions.history(id(req), actor(req), "DISCUSSION", item(req), workspacePageSchema.parse(req.query))),
  decisions: async (req: Request, res: Response) => send(res, await discussions.decisions(id(req), actor(req), discussionQuerySchema.parse(req.query))),
  createDecision: async (req: Request, res: Response) => send(res, await discussions.saveDecision(id(req), actor(req), req.body), 201),
  updateDecision: async (req: Request, res: Response) => send(res, await discussions.saveDecision(id(req), actor(req), req.body, item(req))),
  decisionHistory: async (req: Request, res: Response) => send(res, await discussions.history(id(req), actor(req), "DECISION", item(req), workspacePageSchema.parse(req.query))),
};
