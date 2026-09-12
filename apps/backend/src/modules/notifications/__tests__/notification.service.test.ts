import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationQueue } from "../../../infrastructure/queue.js";
import { notificationService } from "../notification.service.js";
import { DeviceTokenModel } from "../models/device-token.model.js";
import { NotificationModel } from "../models/notification.model.js";

vi.mock("../../../infrastructure/queue.js", () => ({
  notificationQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../models/device-token.model.js", () => ({
  DeviceTokenModel: {
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("../models/notification.model.js", () => ({
  NotificationModel: {
    create: vi.fn(),
  },
}));

describe("notificationService push integration", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts an Expo device token for the authenticated user", async () => {
    vi.mocked(DeviceTokenModel.findOneAndUpdate).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(userId),
      token: "ExponentPushToken[abc]",
      platform: "android",
      lastSeenAt: new Date(),
    } as any);

    await notificationService.registerDeviceToken(userId, {
      token: "ExponentPushToken[abc]",
      platform: "android",
      deviceName: "Pixel 6",
    });

    expect(DeviceTokenModel.findOneAndUpdate).toHaveBeenCalledWith(
      { token: "ExponentPushToken[abc]" },
      expect.objectContaining({
        $set: expect.objectContaining({
          userId: expect.any(mongoose.Types.ObjectId),
          token: "ExponentPushToken[abc]",
          platform: "android",
          deviceName: "Pixel 6",
          disabledAt: null,
        }),
      }),
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  });

  it("enqueues a push job when a user-targeted notification is created", async () => {
    const notificationId = new mongoose.Types.ObjectId();
    vi.mocked(NotificationModel.create).mockResolvedValue({
      _id: notificationId,
      userId: new mongoose.Types.ObjectId(userId),
      title: "Paper approved",
      message: "Your paper was approved.",
    } as any);

    await notificationService.create({
      userId,
      title: "Paper approved",
      message: "Your paper was approved.",
      type: "submission_approved",
    });

    expect(notificationQueue.add).toHaveBeenCalledWith(
      "send-push",
      { notificationId: notificationId.toString() },
      { jobId: notificationId.toString() },
    );
  });
});
