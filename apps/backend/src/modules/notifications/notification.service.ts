import mongoose from "mongoose";
import { notificationQueue } from "../../infrastructure/queue.js";
import { NotificationModel } from "./models/notification.model.js";
import { DeviceTokenModel } from "./models/device-token.model.js";
import type { RegisterDeviceTokenInput } from "./dto/device-token.schema.js";

export const notificationService = {
  async create({
    userId,
    role,
    title,
    message,
    type,
    paperId,
    targetKind,
    targetId,
  }: {
    userId?: string | mongoose.Types.ObjectId;
    role?: string;
    title: string;
    message: string;
    type: string;
    paperId?: string | mongoose.Types.ObjectId;
    targetKind?: "paper" | "report" | "gap" | "project";
    targetId?: string | mongoose.Types.ObjectId;
  }) {
    const resolvedTargetKind = targetKind ?? (paperId ? "paper" : undefined);
    const resolvedTargetId = targetId ?? paperId;

    const notification = await NotificationModel.create({
      userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      role,
      title,
      message,
      type,
      paperId: paperId ? new mongoose.Types.ObjectId(paperId) : undefined,
      targetKind: resolvedTargetKind,
      targetId: resolvedTargetId ? new mongoose.Types.ObjectId(resolvedTargetId) : undefined,
    });

    if (notification.userId) {
      await notificationQueue.add(
        "send-push",
        { notificationId: notification._id.toString() },
        { jobId: notification._id.toString() },
      );
    }

    return notification;
  },

  async registerDeviceToken(userId: string, input: RegisterDeviceTokenInput) {
    return DeviceTokenModel.findOneAndUpdate(
      { token: input.token },
      {
        $set: {
          userId: new mongoose.Types.ObjectId(userId),
          token: input.token,
          platform: input.platform,
          deviceName: input.deviceName,
          lastSeenAt: new Date(),
          disabledAt: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  },

  async list(userId: string, role: string) {
    const filter: Record<string, any> = {
      $or: [
        { userId: new mongoose.Types.ObjectId(userId) },
      ],
    };
    if (role === "admin") {
      filter.$or.push({ role: "admin" });
    }
    const docs = await NotificationModel.find(filter).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => {
      let isRead = doc.isRead;
      if (doc.role === "admin") {
        isRead = doc.readBy.some((id) => id.toString() === userId);
      }

      let title = doc.title;
      let message = doc.message;

      // On-the-fly translation for existing Vietnamese notification records
      if (title === "Yêu cầu đăng bài đang chờ duyệt") {
        title = "Paper Submission Pending";
      } else if (title === "Yêu cầu đăng bài mới") {
        title = "New Paper Submission Request";
      } else if (title === "Bài báo được duyệt thành công") {
        title = "Paper Submission Approved";
      } else if (title === "Yêu cầu đăng bài bị từ chối") {
        title = "Paper Submission Rejected";
      } else if (title === "Test Điều hướng Paper") {
        title = "Paper Navigation Test";
      } else if (title === "Test Điều hướng Report") {
        title = "Report Navigation Test";
      } else if (title === "Test Điều hướng Project") {
        title = "Project Navigation Test";
      }

      if (message && typeof message === "string") {
        if (message.startsWith("Bài báo '") && message.endsWith("' đang chờ duyệt.")) {
          const titleName = message.slice(9, -17);
          message = `Your paper submission request for '${titleName}' is pending review.`;
        } else if (message.startsWith("Người dùng ") && message.includes(" đã gửi yêu cầu đăng bài '")) {
          const parts = message.split(" đã gửi yêu cầu đăng bài '");
          if (parts[0] && parts[1]) {
            const userPart = parts[0].slice(11);
            const titleName = parts[1].slice(0, -2);
            message = `User ${userPart} has submitted a new paper: '${titleName}'.`;
          }
        } else if (message.startsWith("Duyệt thành công bài báo '") && message.endsWith("'.")) {
          const titleName = message.slice(26, -2);
          message = `Your paper submission '${titleName}' has been approved successfully.`;
        } else if (message.startsWith("Bài báo '") && message.includes("' đã bị từ chối. Lý do: ")) {
          const parts = message.split("' đã bị từ chối. Lý do: ");
          if (parts[0] && parts[1]) {
            const titleName = parts[0].slice(9);
            const reason = parts[1];
            message = `Your paper submission '${titleName}' was rejected. Reason: ${reason}`;
          }
        } else if (message === "Click vào đây sẽ nhảy sang trang chi tiết bài báo (Sẽ báo lỗi 404 vì ID này là ID ảo, nhưng URL sẽ đúng).") {
          message = "Click here to navigate to the paper details page (Will show 404 because this is a dummy ID, but the URL will be correct).";
        } else if (message === "Click vào đây sẽ nhảy sang trang Report Detail.") {
          message = "Click here to navigate to the Report Detail page.";
        } else if (message === "Click vào đây sẽ nhảy sang trang Project Detail.") {
          message = "Click here to navigate to the Project Detail page.";
        }
      }

      return {
        id: doc._id.toString(),
        title,
        message,
        type: doc.type,
        paperId: doc.paperId ? doc.paperId.toString() : null,
        targetKind: doc.targetKind ?? (doc.paperId ? "paper" : null),
        targetId: doc.targetId ? doc.targetId.toString() : doc.paperId ? doc.paperId.toString() : null,
        isRead,
        createdAt: doc.createdAt,
      };
    });
  },

  async markAsRead(id: string, userId: string) {
    const notification = await NotificationModel.findById(id);
    if (!notification) return null;

    if (notification.role === "admin") {
      if (!notification.readBy.some((uid) => uid.toString() === userId)) {
        notification.readBy.push(new mongoose.Types.ObjectId(userId));
        await notification.save();
      }
    } else {
      notification.isRead = true;
      await notification.save();
    }
    return notification;
  },

  async markAllAsRead(userId: string, role: string) {
    // For user-targeted notifications, set isRead = true
    await NotificationModel.updateMany(
      { userId: new mongoose.Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true } }
    );

    // For admin-targeted notifications, add user to readBy list
    if (role === "admin") {
      await NotificationModel.updateMany(
        { role: "admin", readBy: { $ne: new mongoose.Types.ObjectId(userId) } },
        { $push: { readBy: new mongoose.Types.ObjectId(userId) } }
      );
    }
  },
};

// Code quality reviewed and formatted
