import type { Request, Response } from "express";
import { mentorAccessService as service } from "./mentor-access.service.js";
import { mentorAccessPageSchema, mentorFeedbackPageSchema, mentorResourceInboxSchema } from "./dto/mentor-access.schema.js";
const project = (r: Request) => String(r.params.id), actor = (r: Request) => r.user!.sub, access = (r: Request) => String(r.params.accessId), item = (r: Request) => String(r.params.itemId);
const send = (r: Response, data: unknown, status = 200) => r.status(status).json({ success: true, data });
export const mentorAccessController = {
  paperShares: async (r: Request, res: Response) => send(res, await service.paperShares(project(r), actor(r), String(r.params.paperId), mentorAccessPageSchema.parse(r.query).page)),
  inbox: async (r: Request, res: Response) => { const query = mentorResourceInboxSchema.parse(r.query); res.set("Cache-Control", "private, no-store"); return send(res, await service.inbox(actor(r), query.page, query)); },
  tasks: async (r: Request, res: Response) => send(res, await service.tasks(project(r), actor(r), mentorAccessPageSchema.parse(r.query).page)),
  workspace: async (r: Request, res: Response) => send(res, await service.workspace(project(r), actor(r), mentorAccessPageSchema.parse(r.query).page, mentorAccessPageSchema.parse(r.query).activeOnly === "true")),
  catalog: async (r: Request, res: Response) => send(res, await service.catalog(project(r), actor(r), mentorAccessPageSchema.parse(r.query))),
  configure: async (r: Request, res: Response) => send(res, await service.configure(project(r), actor(r), access(r), r.body)),
  revoke: async (r: Request, res: Response) => send(res, await service.revoke(project(r), actor(r), access(r), r.body)),
  share: async (r: Request, res: Response) => send(res, await service.share(project(r), actor(r), access(r), r.body), 201),
  paperPdf: async (r: Request, res: Response) => { const file=await service.paperPdf(project(r),actor(r),access(r),item(r)); res.set({"Content-Type":"application/pdf","Content-Disposition":'inline; filename="shared-paper.pdf"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}); return res.send(Buffer.from(file.content)); },
  resource: async (r: Request, res: Response) => send(res, await service.resource(project(r), actor(r), access(r), item(r))),
  unshare: async (r: Request, res: Response) => send(res, await service.unshare(project(r), actor(r), access(r), item(r), r.body)),
  feedback: async (r: Request, res: Response) => { const query = mentorFeedbackPageSchema.parse(r.query); return send(res, await service.feedback(project(r), actor(r), access(r), query.page, query.shareId)); },
  comment: async (r: Request, res: Response) => send(res, await service.comment(project(r), actor(r), access(r), r.body), 201),
  handle: async (r: Request, res: Response) => send(res, await service.handle(project(r), actor(r), access(r), item(r), r.body)),
  history: async (r: Request, res: Response) => send(res, await service.history(project(r), actor(r), access(r), mentorAccessPageSchema.parse(r.query).page)),
  agreements: async (r: Request, res: Response) => send(res, await service.agreements(project(r), actor(r), access(r), mentorAccessPageSchema.parse(r.query).page)),
  propose: async (r: Request, res: Response) => send(res, await service.proposeAgreement(project(r), actor(r), access(r), r.body), 201),
  respond: async (r: Request, res: Response) => send(res, await service.respondAgreement(project(r), actor(r), access(r), item(r), r.body.status)),
};
