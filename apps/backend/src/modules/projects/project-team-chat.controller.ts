import type { Request, Response } from "express";
import type { ProjectTeamChatEvent } from "@trend/shared-types";
import { projectTeamChatEventHub } from "./project-team-chat.events.js";
import { projectTeamChatService } from "./project-team-chat.service.js";
import { assertLiveRequestSession } from "../../common/middleware/auth.js";
import { projectChatReferences } from "./project-chat-references.service.js";
import type { ProjectChatReference } from "@trend/shared-types";
import type { ListProjectTeamChatQuery, SendProjectTeamChatMessageInput } from "./dto/project-team-chat.schema.js";

export class ProjectTeamChatController {
  async sendMessage(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const { content, clientKey, replyToId, reference } = req.body as SendProjectTeamChatMessageInput;
    const message = await projectTeamChatService.sendMessage(projectId, userId, content, clientKey, { replyToId, reference });
    res.status(201).json({ success: true, data: { message }, meta: null });
  }

  async listMessages(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const query = req.query as unknown as ListProjectTeamChatQuery;
    const messages = await projectTeamChatService.listMessages(projectId, userId, query);
    res.json({ success: true, data: { messages }, meta: { count: messages.length } });
  }

  async references(req: Request, res: Response) {
    const { kind, q, page } = req.query as unknown as { kind: ProjectChatReference["kind"]; q: string; page: number };
    res.json({ success: true, data: await projectChatReferences.list(String(req.params.id), req.user!.sub, kind, q, page) });
  }
  async reference(req: Request, res: Response) {
    res.json({ success: true, data: await projectChatReferences.resolve(String(req.params.id), req.user!.sub, req.query as unknown as ProjectChatReference) });
  }

  async markRead(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const messageId = req.params.messageId as string;
    const userId = req.user!.sub;
    const message = await projectTeamChatService.markRead(projectId, messageId, userId);
    res.json({ success: true, data: { message }, meta: null });
  }

  async deleteMessage(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const messageId = req.params.messageId as string;
    const userId = req.user!.sub;
    const userRole = req.user!.role;
    const reason = (req.body as { reason?: string } | undefined)?.reason;
    const message = await projectTeamChatService.deleteMessage(projectId, messageId, userId, {
      reason,
      userRole,
    });
    res.json({ success: true, data: { message }, meta: null });
  }

  async streamEvents(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const userRole = req.user!.role;
    const canonicalProjectId = await projectTeamChatService.assertCanOpenEvents(projectId, userId, userRole);

    req.socket.setTimeout(0);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    writeSse(res, {
      type: "ready",
      projectId,
      occurredAt: new Date().toISOString(),
    });

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true; clearInterval(heartbeat); unsubscribe(); res.end();
    };
    const unsubscribe = projectTeamChatEventHub.subscribe(canonicalProjectId, (event) => {
      void assertLiveRequestSession(req).then(() => projectTeamChatService.assertCanOpenEvents(projectId, userId, userRole)).then(() => { if (!closed) writeSse(res, event); }).catch(cleanup);
    });
    const heartbeat = setInterval(() => {
      void assertLiveRequestSession(req).then(() => projectTeamChatService.assertCanOpenEvents(projectId, userId, userRole)).then(() => { if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`); }).catch(cleanup);
    }, 25_000);
    req.on("close", cleanup);
  }
}

export const projectTeamChatController = new ProjectTeamChatController();

function writeSse(res: Response, event: ProjectTeamChatEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
