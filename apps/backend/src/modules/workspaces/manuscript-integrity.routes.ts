import type { Router, Request, RequestHandler } from "express";
import { z } from "zod";
import { validate } from "../../common/middleware/validate.js";
import { manuscriptIntegrityService as integrity } from "./manuscript-integrity.service.js";
import { integrityCommandSchema, aiAcceptanceSchema } from "./dto/manuscript-integrity.schema.js";

export function mountManuscriptIntegrityRoutes(router: Router, ids: (req: Request) => Promise<{ project: string; actor: string; id: string }>, writes: RequestHandler) {
  const snapshot = z.object({ snapshotId: z.string().uuid() }).passthrough();
  const report = snapshot.extend({ recordId: z.string().uuid() });
  router.get("/:id/snapshots/:snapshotId/integrity", validate(snapshot, "params"), async (req, res) => {
    const a = await ids(req); res.json({ success: true, data: await integrity.overview(a.project, a.actor, a.id, String(req.params.snapshotId)) });
  });
  router.post("/:id/snapshots/:snapshotId/integrity", writes, validate(snapshot, "params"), validate(integrityCommandSchema), async (req, res) => {
    const a = await ids(req); res.status(201).json({ success: true, data: await integrity.command(a.project, a.actor, a.id, String(req.params.snapshotId), req.body) });
  });
  router.get("/:id/snapshots/:snapshotId/integrity/:recordId/declaration", validate(report, "params"), async (req, res) => {
    const a = await ids(req); res.json({ success: true, data: await integrity.declarationPacket(a.project, a.actor, a.id, String(req.params.snapshotId), String(req.params.recordId)) });
  });
  router.get("/:id/snapshots/:snapshotId/integrity/:recordId/export", validate(report, "params"), async (req, res) => {
    const a = await ids(req); const data = await integrity.exportReport(a.project, a.actor, a.id, String(req.params.snapshotId), String(req.params.recordId));
    res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="lumigap-integrity-report.json"', "X-Content-Type-Options": "nosniff" }).send(JSON.stringify(data, null, 2));
  });
  router.post("/:id/ai/:runId/acceptance", writes, validate(z.object({ runId: z.string().uuid() }).passthrough(), "params"), validate(aiAcceptanceSchema), async (req, res) => {
    const a = await ids(req); res.status(201).json({ success: true, data: await integrity.recordAiAcceptance(a.project, a.actor, a.id, String(req.params.runId), req.body) });
  });
}
