import type { Request, Response } from "express";
import { mentorWorkspaceQuerySchema } from "./dto/mentor-workspace.schema.js";
import { mentorWorkspaceService } from "./mentor-workspace.service.js";

export async function getMentorWorkspace(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  res.json({ success: true, data: await mentorWorkspaceService.read(req.user!.sub, mentorWorkspaceQuerySchema.parse(req.query)) });
}
