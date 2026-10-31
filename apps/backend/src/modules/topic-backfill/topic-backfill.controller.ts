import { isAdminSystemRole } from "@trend/shared-types";
import type { Request, Response } from "express";
import type {
  AdminBackfillRequest, ListBackfillRunsQuery, SearchBackfillRequest,
} from "./dto/topic-backfill.schema.js";
import { topicBackfillService } from "./topic-backfill.service.js";

/** 202 when a run was queued, 200 when the request attached to an existing run. */
function respond(res: Response, result: { created: boolean }) {
  res.status(result.created ? 202 : 200).json({ success: true, data: result });
}

export const topicBackfillController = {
  async requestFromSearch(req: Request<unknown, unknown, SearchBackfillRequest>, res: Response) {
    respond(res, await topicBackfillService.requestFromSearch(req.user!.sub, req.body));
  },

  async requestFromAdmin(req: Request<unknown, unknown, AdminBackfillRequest>, res: Response) {
    respond(res, await topicBackfillService.requestFromAdmin(req.user!.sub, req.body));
  },

  async getRun(req: Request<{ id: string }>, res: Response) {
    const isAdmin = isAdminSystemRole(req.user!.systemRole);
    res.json({ success: true, data: await topicBackfillService.getRun(req.params.id, { isAdmin }) });
  },

  async listRuns(req: Request, res: Response) {
    const result = await topicBackfillService.listRuns(req.query as unknown as ListBackfillRunsQuery);
    res.json({ success: true, data: result.data, meta: result.meta });
  },
};
