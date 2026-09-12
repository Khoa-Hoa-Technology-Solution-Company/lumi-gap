import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../common/exceptions/app-error.js";
import { auditService } from "../../audit/audit.service.js";
import { notificationService } from "../../notifications/notification.service.js";
import { projectTeamChatEventHub } from "../project-team-chat.events.js";
import { ProjectModel } from "../models/project.model.js";
import { ProjectTeamMessageModel } from "../models/project-team-message.model.js";
import { projectTeamChatService } from "../project-team-chat.service.js";

vi.mock("../models/project.model.js", () => ({
  ProjectModel: {
    findById: vi.fn(),
  },
}));

vi.mock("../models/project-team-message.model.js", () => ({
  ProjectTeamMessageModel: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../../audit/audit.service.js", () => ({
  auditService: {
    log: vi.fn(),
  },
}));

vi.mock("../../notifications/notification.service.js", () => ({
  notificationService: {
    create: vi.fn(),
  },
}));

vi.mock("../project-team-chat.events.js", () => ({
  projectTeamChatEventHub: {
    publish: vi.fn(),
  },
}));

function queryReturning<T>(value: T) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

function messageQueryReturning<T>(value: T) {
  return {
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

describe("projectTeamChatService", () => {
  const projectId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId().toString();
  const memberId = new mongoose.Types.ObjectId().toString();
  const outsiderId = new mongoose.Types.ObjectId().toString();
  const adminId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a project member send a team message without credit or LLM work", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );
    vi.mocked(ProjectTeamMessageModel.create).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
    } as any);
    const createdAt = new Date("2026-07-16T04:00:00.000Z");
    vi.mocked(ProjectTeamMessageModel.findById).mockReturnValue(
      messageQueryReturning({
        _id: new mongoose.Types.ObjectId(),
        projectId,
        senderId: { _id: memberId, fullName: "Member One", email: "member@test.local" },
        content: "Please review paper 3",
        readBy: [{ _id: memberId, fullName: "Member One", email: "member@test.local" }],
        isDeleted: false,
        createdAt,
      }) as any,
    );

    const result = await projectTeamChatService.sendMessage(projectId, memberId, " Please review paper 3 ");

    expect(ProjectTeamMessageModel.create).toHaveBeenCalledWith({
      projectId: new mongoose.Types.ObjectId(projectId),
      senderId: new mongoose.Types.ObjectId(memberId),
      content: "Please review paper 3",
      readBy: [new mongoose.Types.ObjectId(memberId)],
    });
    expect(notificationService.create).toHaveBeenCalledWith({
      userId: ownerId,
      title: "New project team message",
      message: "Member One sent a message in your project.",
      type: "project_team_chat",
      targetKind: "project",
      targetId: projectId,
    });
    expect(auditService.log).toHaveBeenCalledWith("project.team_chat.message_sent", {
      userId: memberId,
      targetTableName: "research_projects",
      targetRecordId: projectId,
      details: { messageId: expect.any(String) },
    });
    expect(projectTeamChatEventHub.publish).toHaveBeenCalledWith({
      type: "message.created",
      projectId,
      message: expect.objectContaining({ content: "Please review paper 3" }),
      occurredAt: expect.any(String),
    });
    expect(result).toMatchObject({
      projectId,
      sender: { id: memberId, fullName: "Member One", email: "member@test.local" },
      content: "Please review paper 3",
      readCount: 1,
      isDeleted: false,
      createdAt: createdAt.toISOString(),
    });
  });

  it("rejects users outside the project", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );

    await expect(projectTeamChatService.sendMessage(projectId, outsiderId, "hello")).rejects.toThrow(
      AppError,
    );
    expect(ProjectTeamMessageModel.create).not.toHaveBeenCalled();
  });

  it("lists newest messages in chronological order for display", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );
    const older = {
      _id: new mongoose.Types.ObjectId(),
      projectId,
      senderId: { _id: ownerId, fullName: "Owner", email: "owner@test.local" },
      content: "First",
      readBy: [ownerId],
      isDeleted: false,
      createdAt: new Date("2026-07-16T04:00:00.000Z"),
    };
    const newer = {
      _id: new mongoose.Types.ObjectId(),
      projectId,
      senderId: { _id: memberId, fullName: "Member", email: "member@test.local" },
      content: "Second",
      readBy: [memberId],
      isDeleted: false,
      createdAt: new Date("2026-07-16T04:01:00.000Z"),
    };
    vi.mocked(ProjectTeamMessageModel.find).mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([newer, older]),
    } as any);

    const messages = await projectTeamChatService.listMessages(projectId, memberId, { limit: 20 });

    expect(messages.map((message) => message.content)).toEqual(["First", "Second"]);
    expect(ProjectTeamMessageModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [newer._id, older._id] }, readBy: { $ne: new mongoose.Types.ObjectId(memberId) } },
      { $addToSet: { readBy: new mongoose.Types.ObjectId(memberId) } },
    );
    expect(projectTeamChatEventHub.publish).toHaveBeenCalledWith({
      type: "message.updated",
      projectId,
      message: expect.objectContaining({ id: older._id.toString(), readCount: 2 }),
      occurredAt: expect.any(String),
    });
  });

  it("publishes an update event when a member marks a message as read", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );
    const messageId = new mongoose.Types.ObjectId();
    vi.mocked(ProjectTeamMessageModel.findOneAndUpdate).mockReturnValue(
      messageQueryReturning({
        _id: messageId,
        projectId,
        senderId: { _id: ownerId, fullName: "Owner", email: "owner@test.local" },
        content: "Please read",
        readBy: [{ _id: memberId, fullName: "Member", email: "member@test.local" }],
        isDeleted: false,
        createdAt: new Date("2026-07-16T04:01:00.000Z"),
      }) as any,
    );

    const result = await projectTeamChatService.markRead(projectId, messageId.toString(), memberId);

    expect(result.readCount).toBe(1);
    expect(projectTeamChatEventHub.publish).toHaveBeenCalledWith({
      type: "message.updated",
      projectId,
      message: expect.objectContaining({ id: messageId.toString(), readCount: 1 }),
      occurredAt: expect.any(String),
    });
  });

  it("soft deletes a sender message and hides its content", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );
    const messageId = new mongoose.Types.ObjectId();
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ProjectTeamMessageModel.findOne).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: messageId,
        projectId,
        senderId: memberId,
        content: "delete me",
        readBy: [],
        isDeleted: false,
        createdAt: new Date("2026-07-16T04:01:00.000Z"),
        save,
      }),
    } as any);

    const result = await projectTeamChatService.deleteMessage(
      projectId,
      messageId.toString(),
      memberId,
      "Duplicate request",
    );

    expect(save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith("project.team_chat.message_deleted", {
      userId: memberId,
      targetTableName: "research_projects",
      targetRecordId: projectId,
      details: { messageId: messageId.toString(), reason: "Duplicate request" },
    });
    expect(projectTeamChatEventHub.publish).toHaveBeenCalledWith({
      type: "message.deleted",
      projectId,
      message: expect.objectContaining({ id: messageId.toString(), isDeleted: true }),
      occurredAt: expect.any(String),
    });
    expect(result).toMatchObject({
      id: messageId.toString(),
      content: "",
      isDeleted: true,
      deleteReason: "Duplicate request",
    });
  });

  it("rejects deleting another member message unless owner", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );
    const messageId = new mongoose.Types.ObjectId();
    vi.mocked(ProjectTeamMessageModel.findOne).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: messageId,
        projectId,
        senderId: memberId,
        content: "protected",
        readBy: [],
        isDeleted: false,
        createdAt: new Date("2026-07-16T04:01:00.000Z"),
        save: vi.fn(),
      }),
    } as any);

    await expect(
      projectTeamChatService.deleteMessage(projectId, messageId.toString(), outsiderId, "Nope"),
    ).rejects.toThrow(AppError);
  });

  it("lets an admin soft delete a message without being a project member", async () => {
    vi.mocked(ProjectModel.findById).mockReturnValue(
      queryReturning({
        _id: projectId,
        ownerId,
        members: [{ targetId: memberId, role: "member" }],
      }) as any,
    );
    const messageId = new mongoose.Types.ObjectId();
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ProjectTeamMessageModel.findOne).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: messageId,
        projectId,
        senderId: memberId,
        content: "moderate me",
        readBy: [],
        isDeleted: false,
        createdAt: new Date("2026-07-16T04:01:00.000Z"),
        save,
      }),
    } as any);

    const result = await projectTeamChatService.deleteMessage(projectId, messageId.toString(), adminId, {
      reason: "Policy violation",
      userRole: "admin",
    });

    expect(save).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: messageId.toString(),
      isDeleted: true,
      deleteReason: "Policy violation",
    });
  });
});
