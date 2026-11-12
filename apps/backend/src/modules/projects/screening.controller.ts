import { assertLiveRequestSession } from "../../common/middleware/auth.js";
import { screeningEventHub } from "./screening.events.js";
import { screeningCaseService } from "./screening-case.service.js";
import { screeningObligationsService } from "./screening-obligations.js";
import { libraryAssessmentService as library } from "./library-assessment.service.js";
import { projectAnalysisSetService as sets } from "./project-analysis-set.service.js";
import type { Request, Response } from "express";
import { screeningService as service } from "./screening.service.js";
import { screeningAiService as ai } from "./screening-ai.service.js";
import { screeningPageSchema, screeningHistorySchema } from "./dto/screening.schema.js";
const project = (r: Request) => String(r.params.id), actor = (r: Request) => r.user!.sub, round = (r: Request) => String(r.params.roundId);
const send = (r: Response, data: unknown, status = 200) => r.status(status).json({ success: true, data });
export const screeningController = {
  confirmConsensus: async (r: Request, res: Response) => send(res, await service.confirmConsensus(project(r), actor(r), round(r), r.body)),
  automaticTasks: async (r: Request, res: Response) => send(res, await screeningObligationsService.list(project(r), actor(r))),
  resumeFullText: async (r: Request, res: Response) => send(res, await service.resumeFullText(project(r), actor(r), round(r), r.body)),
  caseAction: async (r: Request, res: Response) => send(res, await screeningCaseService.act(project(r), actor(r), round(r), r.body)),
  caseSource: async (r: Request, res: Response) => { const bytes = await screeningCaseService.source(project(r), actor(r), round(r), String(r.params.fileId), r.query.caseId as string | undefined); res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="paper-source.pdf"', "X-Content-Type-Options": "nosniff" }).send(Buffer.from(bytes)); },
  adjudicationTasks: async (r: Request, res: Response) => send(res, await service.adjudicationTasks(project(r), actor(r))),
  advanceConservatively: async (r: Request, res: Response) => send(res, await service.advanceConservatively(project(r), actor(r), round(r), r.body)),
  begin: async (r: Request, res: Response) => send(res, await service.begin(project(r), actor(r), String(r.params.paperId), r.body)),
  declineAgreement: async (r: Request, res: Response) => send(res, await service.declineAgreement(project(r), actor(r), round(r), r.body)),
  requestAdjudication: async (r: Request, res: Response) => send(res, await service.requestAdjudication(project(r), actor(r), round(r), r.body)),
  proposeAgreement: async (r: Request, res: Response) => send(res, await service.proposeAgreement(project(r), actor(r), round(r), r.body)),
  confirmAgreement: async (r: Request, res: Response) => send(res, await service.confirmAgreement(project(r), actor(r), round(r), r.body)),
  adjudication: async (r: Request, res: Response) => send(res, await service.adjudication(project(r), actor(r), round(r), r.query.caseId as string | undefined)),
  assess: async (r: Request, res: Response) => send(res, await library.assess(project(r), actor(r), String(r.params.paperId), r.body)),
  defer: async (r: Request, res: Response) => send(res, await library.defer(project(r), actor(r), round(r), r.body)),
  createSet: async (r: Request, res: Response) => send(res, await sets.create(project(r), actor(r), r.body), 201),
  getSet: async (r: Request, res: Response) => send(res, await sets.get(project(r), actor(r), String(r.params.setId))),
  listSets: async (r: Request, res: Response) => send(res, await sets.list(project(r), actor(r), screeningPageSchema.parse(r.query).page)),
  config: async (r: Request, res: Response) => send(res, await service.config(project(r), actor(r))),
  configure: async (r: Request, res: Response) => send(res, await service.configure(project(r), actor(r), r.body)),
  board: async (r: Request, res: Response) => send(res, await service.board(project(r), actor(r), screeningPageSchema.parse(r.query))),
  start: async (r: Request, res: Response) => send(res, await service.start(project(r), actor(r), r.body)),
  assign: async (r: Request, res: Response) => send(res, await service.assign(project(r), actor(r), r.body)),
  detail: async (r: Request, res: Response) => send(res, await service.detail(project(r), actor(r), round(r))),
  submit: async (r: Request, res: Response) => send(res, await service.submit(project(r), actor(r), round(r), r.body)),
  reassess: async (r: Request, res: Response) => send(res, await service.reassess(project(r), actor(r), round(r), r.body)),
  resolve: async (r: Request, res: Response) => send(res, await service.resolve(project(r), actor(r), round(r), r.body)),
  finalizer: async (r: Request, res: Response) => send(res, await service.finalizer(project(r), actor(r), round(r), r.body)),
  proposal: async (r: Request, res: Response) => send(res, await service.proposal(project(r), actor(r), String(r.params.paperId), r.body)),
  reopen: async (r: Request, res: Response) => send(res, await service.reopen(project(r), actor(r), round(r), r.body)),
  unblind: async (r: Request, res: Response) => send(res, await service.unblind(project(r), actor(r), round(r), r.body)),
  comment: async (r: Request, res: Response) => send(res, await service.comment(project(r), actor(r), round(r), r.body)),
  history: async (r: Request, res: Response) => { const query = screeningHistorySchema.parse(r.query); return send(res, await service.history(project(r), actor(r), round(r), query.page, query.kind)); },
  rounds: async (r: Request, res: Response) => send(res, await service.rounds(project(r), actor(r), String(r.params.paperId), screeningPageSchema.parse(r.query).page)),
  analytics: async (r: Request, res: Response) => send(res, await service.analytics(project(r), actor(r))),
  ai: async (r: Request, res: Response) => send(res, await ai.get(project(r), actor(r), round(r))),
  requestAi: async (r: Request, res: Response) => send(res, await ai.request(project(r), actor(r), round(r), r.body.clientKey), 202),
  workspaceSummary: async (r: Request, res: Response) => send(res, await service.workspaceSummary(project(r), actor(r))),
  claim: async (r: Request, res: Response) => send(res, await service.claim(project(r), actor(r), round(r), r.body)),
  claimNext: async (r: Request, res: Response) => send(res, await service.claimNext(project(r), actor(r), r.body)),
  release: async (r: Request, res: Response) => send(res, await service.release(project(r), actor(r), round(r), r.body)),
  extend: async (r: Request, res: Response) => send(res, await service.extend(project(r), actor(r), round(r), r.body)),
  extendDiscussion: async (r: Request, res: Response) => send(res, await service.extendDiscussion(project(r), actor(r), round(r), r.body)),
  closeUnresolved: async (r: Request, res: Response) => send(res, await service.closeUnresolved(project(r), actor(r), round(r), r.body)),
  reopenUnresolved: async (r: Request, res: Response) => send(res, await service.reopenUnresolved(project(r), actor(r), round(r), r.body)),
  requestMoreInfo: async (r: Request, res: Response) => send(res, await service.requestMoreInfo(project(r), actor(r), round(r), r.body)),
  grantProposerException: async (r: Request, res: Response) => send(res, await service.grantProposerException(project(r), actor(r), round(r), r.body)),
  updateDiscoveryGoal: async (r: Request, res: Response) => send(res, await service.updateDiscoveryGoal(project(r), actor(r), r.body)),
  streamEvents: async (r: Request, res: Response) => {
    const projectId = project(r);
    const roundId = round(r);
    const userId = actor(r);
    await service.detail(projectId, userId, roundId);

    res.socket?.setTimeout(0);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const writeSse = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    writeSse({
      type: "ready",
      projectId,
      roundId,
      occurredAt: new Date().toISOString(),
    });

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    };

    const unsubscribe = screeningEventHub.subscribe(roundId, (event) => {
      void assertLiveRequestSession(r).then(() => service.detail(projectId, userId, roundId)).then(() => { if (!closed) writeSse(event); }).catch(cleanup);
    });

    const heartbeat = setInterval(() => {
      void assertLiveRequestSession(r).then(() => service.detail(projectId, userId, roundId)).then(() => { if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`); }).catch(cleanup);
    }, 25_000);

    r.on("close", cleanup);
  },
};
