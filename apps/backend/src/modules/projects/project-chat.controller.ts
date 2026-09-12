import type { Request, Response } from "express";
import type { ProjectChatEvent } from "@trend/shared-types";
import { projectChatEventHub } from "./project-chat.events.js";
import { projectChatService } from "./project-chat.service.js";

export class ProjectChatController {
  async sendMessage(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const { message, scope = "private" } = req.body as { message: string; scope?: "private" | "team" };
    const result = await projectChatService.sendMessage(projectId, userId, message, scope);
    res.json({ success: true, data: result, meta: null });
  }

  async listHistory(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const { limit, scope = "private" } = req.query as unknown as { limit: number; scope?: "private" | "team" };
    const messages = await projectChatService.listHistory(projectId, userId, limit, scope);
    res.json({ success: true, data: { messages }, meta: { count: messages.length } });
  }

  async setPinned(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const messageId = req.params.messageId as string;
    const userId = req.user!.sub;
    const { pinned } = req.body as { pinned: boolean };
    const message = await projectChatService.setPinned(projectId, messageId, userId, pinned);
    res.json({ success: true, data: { message }, meta: null });
  }

  async streamEvents(req: Request, res: Response) {
    const projectId = req.params.id as string;
    const userId = req.user!.sub;
    const { scope = "team" } = req.query as unknown as { scope?: "private" | "team" };
    await projectChatService.assertCanOpenEvents(projectId, userId);

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
      scope,
      occurredAt: new Date().toISOString(),
    });

    const unsubscribe = projectChatEventHub.subscribe(projectId, (event) => {
      if (event.scope !== scope) return;
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

export const projectChatController = new ProjectChatController();

function writeSse(res: Response, event: ProjectChatEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
