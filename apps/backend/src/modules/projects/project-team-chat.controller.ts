import type { Request, Response } from "express";
import type { ProjectTeamChatEvent } from "@trend/shared-types";
import { projectTeamChatEventHub } from "./project-team-chat.events.js";
import { projectTeamChatService } from "./project-team-chat.service.js";

export class ProjectTeamChatController {
  async sendMessage(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const content = (req.body as { content: string }).content;
    const message = await projectTeamChatService.sendMessage(projectId, userId, content);
    res.status(201).json({ success: true, data: { message }, meta: null });
  }

  async listMessages(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const query = req.query as unknown as { limit: number; before?: string };
    const messages = await projectTeamChatService.listMessages(projectId, userId, query);
    res.json({ success: true, data: { messages }, meta: { count: messages.length } });
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
    await projectTeamChatService.assertCanOpenEvents(projectId, userId, userRole);

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

    const unsubscribe = projectTeamChatEventHub.subscribe(projectId, (event) => {
      writeSse(res, event);
    });
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  }
}

export const projectTeamChatController = new ProjectTeamChatController();

function writeSse(res: Response, event: ProjectTeamChatEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
