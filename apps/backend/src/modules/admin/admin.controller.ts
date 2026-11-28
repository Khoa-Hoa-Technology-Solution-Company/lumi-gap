import type { Request, Response } from "express";
import { adminService } from "./admin.service.js";
import {
  ListAiOperationsQuerySchema,
  ListAuditLogsQuerySchema,
  ListUsersQuerySchema,
} from "./dto/admin.schema.js";
import type {
  AdminReasonInput,
  CreateUserInput,
  UpdateAdminApiProviderInput,
  UpdateAdminInstitutionInput,
  UpdateRoleInput,
  UpdateStatusInput,
  UpdateUserInput,
} from "./dto/admin.schema.js";

export const adminController = {
  async listUsers(req: Request, res: Response) {
    const q = ListUsersQuerySchema.parse(req.query);
    const result = await adminService.listUsers(q);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async updateRole(req: Request<{ id: string }, unknown, UpdateRoleInput>, res: Response) {
    const user = await adminService.updateRole(req.user!.sub, req.params.id, req.body.role, req.body.reason);
    res.json({ success: true, data: user });
  },

  async updateStatus(req: Request<{ id: string }, unknown, UpdateStatusInput>, res: Response) {
    const user = await adminService.updateStatus(req.user!.sub, req.params.id, req.body.accountStatus, req.body.reason);
    res.json({ success: true, data: user });
  },

  async getUser(req: Request<{ id: string }>, res: Response) {
    const data = await adminService.getUser(req.params.id);
    res.json({ success: true, data });
  },

  async summary(_req: Request, res: Response) {
    const data = await adminService.summary();
    res.json({ success: true, data });
  },

  async createUser(req: Request<unknown, unknown, CreateUserInput>, res: Response) {
    const data = await adminService.createUser(req.user!.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async updateUser(req: Request<{ id: string }, unknown, UpdateUserInput>, res: Response) {
    const data = await adminService.updateUser(req.user!.sub, req.params.id, req.body);
    res.json({ success: true, data });
  },

  async revokeSessions(req: Request<{ id: string }, unknown, AdminReasonInput>, res: Response) {
    const data = await adminService.revokeSessions(req.user!.sub, req.params.id, req.body.reason);
    res.json({ success: true, data });
  },

  async stats(_req: Request, res: Response) {
    const data = await adminService.stats();
    res.json({ success: true, data });
  },

  async listAuditLogs(req: Request, res: Response) {
    const q = ListAuditLogsQuerySchema.parse(req.query);
    const result = await adminService.listAuditLogs(q);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async listWorkers(_req: Request, res: Response) {
    const data = await adminService.listWorkersStatus();
    res.json({ success: true, data });
  },

  async listAiOperations(req: Request, res: Response) {
    const q = ListAiOperationsQuerySchema.parse(req.query);
    const data = await adminService.listAiOperations(q);
    res.json({ success: true, data });
  },

  async getSettings(_req: Request, res: Response) {
    const data = await adminService.getPlatformSettings();
    res.json({ success: true, data });
  },

  async updateInstitution(req: Request<{ id: string }, unknown, UpdateAdminInstitutionInput>, res: Response) {
    const data = await adminService.updateInstitutionSetting(req.user!.sub, req.params.id, req.body);
    res.json({ success: true, data });
  },

  async updateApiProvider(req: Request<{ id: string }, unknown, UpdateAdminApiProviderInput>, res: Response) {
    const data = await adminService.updateApiProviderSetting(req.user!.sub, req.params.id, req.body);
    res.json({ success: true, data });
  },
};
