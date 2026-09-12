import type { Request, Response } from "express";
import { adminService } from "./admin.service.js";
import { ListUsersQuerySchema } from "./dto/admin.schema.js";
import type { UpdateRoleInput, UpdateStatusInput } from "./dto/admin.schema.js";

export const adminController = {
  async listUsers(req: Request, res: Response) {
    const q = ListUsersQuerySchema.parse(req.query);
    const result = await adminService.listUsers(q);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async updateRole(req: Request<{ id: string }, unknown, UpdateRoleInput>, res: Response) {
    const user = await adminService.updateRole(req.user!.sub, req.params.id, req.body.role);
    res.json({ success: true, data: user });
  },

  async updateStatus(req: Request<{ id: string }, unknown, UpdateStatusInput>, res: Response) {
    const user = await adminService.updateStatus(req.user!.sub, req.params.id, req.body.isActive);
    res.json({ success: true, data: user });
  },

  async stats(_req: Request, res: Response) {
    const data = await adminService.stats();
    res.json({ success: true, data });
  },
};
