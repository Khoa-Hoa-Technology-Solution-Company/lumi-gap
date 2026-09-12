import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const paperModel = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

const userModel = vi.hoisted(() => ({
  findById: vi.fn(),
}));

const notifications = vi.hoisted(() => ({
  create: vi.fn(),
}));

const points = vi.hoisted(() => ({
  chargePaperRequestCreditChecked: vi.fn(),
  refundPaperRequestCredit: vi.fn(),
  rewardPaperUploadCredit: vi.fn(),
  recordInvalidPdfUpload: vi.fn(),
  chargePaperDownloadCredit: vi.fn(),
  syncUserPoints: vi.fn(),
  applyUploadCreditReward: vi.fn(),
  clawbackUploadReward: vi.fn(),
  REQUEST_PAPER_COST: 100,
}));

const downloads = vi.hoisted(() => ({
  findOne: vi.fn(),
  deleteMany: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  getSignedDownloadUrl: vi.fn(),
  deletePdf: vi.fn(),
  resolveLocalPath: vi.fn(),
}));

vi.mock("../models/paper.model.js", () => ({
  PaperModel: paperModel,
}));

vi.mock("../models/paper-download.model.js", () => ({
  PaperDownloadModel: downloads,
}));

vi.mock("../../auth/models/user.model.js", () => ({
  UserModel: userModel,
}));

vi.mock("../../notifications/notification.service.js", () => ({
  notificationService: notifications,
}));

vi.mock("../../auth/points.service.js", () => points);

vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({
  pdfStorageService: storage,
}));

const { paperService } = await import("../paper.service.js");

const validInput = {
  title: "Mobile API Optional PDF Smoke Test",
  doi: "10.1234/mobile.optional.pdf",
  paperLink: "https://example.com/mobile-optional-pdf",
  abstractText:
    "This abstract verifies optional PDF submission for a mobile workflow. It contains enough words to satisfy validation and describes metadata, authors, topics, keywords, project linkage, and review behavior in the publication trend system without attaching a local document file.",
  publicationYear: 2025,
  paperKind: "article" as const,
  authors: [{ displayName: "Codex Tester", position: 1, isCorresponding: true }],
  keywords: [{ keywordName: "mobile api" }],
  topics: [{ topicName: "Mobile Integration" }],
  openAccessUrl: "https://example.com/mobile-optional-pdf/fulltext",
};

describe("paperService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paperModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    points.chargePaperRequestCreditChecked.mockResolvedValue(true);
    points.syncUserPoints.mockResolvedValue(undefined);
    notifications.create.mockResolvedValue(undefined);
    userModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ fullName: "Codex Tester" }),
    });
    storage.getSignedDownloadUrl.mockResolvedValue(null);
  });

  it("allows a non-admin paper request without an attached PDF", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const createdId = new mongoose.Types.ObjectId();
    paperModel.create.mockResolvedValue({
      _id: createdId,
      ...validInput,
      externalIds: { doi: validInput.doi },
      primaryProvider: "user",
      dataStatus: "draft",
      paperStatus: "pending",
      requestedBy: new mongoose.Types.ObjectId(userId),
      pdfPath: undefined,
    });

    const result = await paperService.create(userId, false, validInput);

    expect(result.id).toBe(String(createdId));
    expect(paperModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: validInput.title,
        paperStatus: "pending",
        dataStatus: "draft",
        pdfPath: undefined,
        uploadedBy: undefined,
        uploadedAt: undefined,
      }),
    );
    expect(points.chargePaperRequestCreditChecked).toHaveBeenCalledWith(userId);

    const createInput = paperModel.create.mock.calls[0]?.[0];
    expect(createInput.dataQualityScore).toBeGreaterThan(0);
    expect(createInput.aiScore.metadataQualityScore).toBe(createInput.dataQualityScore);
    expect(createInput.aiScore.finalScore).toBeGreaterThan(0);
  });

  it("returns an R2 signed URL for PDF downloads instead of a backend token URL", async () => {
    const paperId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const uploadedBy = new mongoose.Types.ObjectId();
    const pdfUri = "r2://papers-bucket/papers/example.pdf";
    const signedUrl = "https://r2.example.com/signed";
    paperModel.findById.mockResolvedValue({
      _id: paperId,
      requestedBy: new mongoose.Types.ObjectId(),
      uploadedBy,
      paperStatus: "downloaded",
      qualityTier: 2,
      downloadCost: 30,
      pdfPath: pdfUri,
    });
    userModel.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ credits: 100 }),
      }),
    });
    downloads.findOne.mockResolvedValue(null);
    paperModel.findByIdAndUpdate.mockResolvedValue(undefined);
    points.chargePaperDownloadCredit.mockResolvedValue({ cost: 30, isRepeatDownload: false });
    storage.getSignedDownloadUrl.mockResolvedValue(signedUrl);

    const result = await paperService.getPdfDownloadUrl(
      String(paperId),
      String(userId),
      "student",
      "https://api.example.com",
    );

    expect(result.downloadUrl).toBe(signedUrl);
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(pdfUri);
    expect(points.chargePaperDownloadCredit).toHaveBeenCalled();
  });

  it("does not charge download credits when signed URL generation fails", async () => {
    const paperId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    paperModel.findById.mockResolvedValue({
      _id: paperId,
      requestedBy: new mongoose.Types.ObjectId(),
      uploadedBy: new mongoose.Types.ObjectId(),
      paperStatus: "downloaded",
      qualityTier: 2,
      downloadCost: 30,
      pdfPath: "r2://papers-bucket/papers/unavailable.pdf",
    });
    userModel.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ credits: 100 }),
      }),
    });
    downloads.findOne.mockResolvedValue(null);
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("R2 unavailable"));

    await expect(
      paperService.getPdfDownloadUrl(
        String(paperId),
        String(userId),
        "student",
        "https://api.example.com",
      ),
    ).rejects.toThrow("R2 unavailable");

    expect(points.chargePaperDownloadCredit).not.toHaveBeenCalled();
    expect(paperModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects only the contributed PDF while keeping an imported paper public", async () => {
    const paperId = new mongoose.Types.ObjectId();
    const uploaderId = new mongoose.Types.ObjectId();
    const pdfPath = "r2://papers-bucket/papers/rejected-contribution.pdf";
    const paperData = {
      _id: paperId,
      title: "Imported OpenAlex paper",
      primaryProvider: "openalex",
      requestedBy: undefined,
      uploadedBy: uploaderId,
      uploadedAt: new Date(),
      paperStatus: "pending",
      dataStatus: "active",
      pdfPath,
      publicationYear: 2025,
      citationCount: 10,
      authors: [{ displayName: "Researcher", position: 1 }],
      keywords: [],
      topics: [],
      externalIds: { openalexId: "W123" },
      dataQualityScore: 0.5,
    };
    paperModel.findById.mockResolvedValue({
      ...paperData,
      toObject: () => ({ ...paperData }),
    });
    paperModel.findOneAndUpdate.mockResolvedValue({
      ...paperData,
      pdfPath: undefined,
      uploadedBy: undefined,
      uploadedAt: undefined,
      paperStatus: "not-downloaded",
      dataStatus: "active",
    });
    storage.deletePdf.mockResolvedValue(undefined);
    points.recordInvalidPdfUpload.mockResolvedValue(undefined);

    const result = await paperService.updateStatus(
      String(paperId),
      "rejected",
      "The uploaded file is not the correct paper",
    );

    expect(result.paperStatus).toBe("not-downloaded");
    expect(result.dataStatus).toBe("active");
    expect(paperModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: String(paperId), paperStatus: "pending", pdfPath }),
      expect.objectContaining({
        $unset: expect.objectContaining({ pdfPath: "", uploadedBy: "", uploadedAt: "" }),
        paperStatus: "not-downloaded",
        dataStatus: "active",
      }),
      { new: true },
    );
    expect(storage.deletePdf).toHaveBeenCalledWith(pdfPath);
    expect(points.recordInvalidPdfUpload).toHaveBeenCalledWith(String(uploaderId));
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: uploaderId, type: "submission_rejected" }),
    );
  });

  it("keeps active imported metadata searchable when an admin removes its PDF", async () => {
    const paperId = new mongoose.Types.ObjectId();
    const uploaderId = new mongoose.Types.ObjectId();
    const pdfPath = "r2://papers-bucket/papers/removable.pdf";
    const paperData = {
      _id: paperId,
      title: "Active imported metadata",
      primaryProvider: "openalex",
      uploadedBy: uploaderId,
      paperStatus: "downloaded",
      dataStatus: "active",
      pdfPath,
      publicationYear: 2025,
      citationCount: 5,
      authors: [{ displayName: "Researcher", position: 1 }],
      keywords: [],
      topics: [],
      externalIds: { openalexId: "W456" },
      dataQualityScore: 0.8,
      toObject() {
        return { ...this };
      },
    };
    paperModel.findById.mockResolvedValue(paperData);
    paperModel.findByIdAndUpdate.mockResolvedValue({
      ...paperData,
      pdfPath: undefined,
      uploadedBy: undefined,
      paperStatus: "not-downloaded",
      dataStatus: "active",
    });
    storage.deletePdf.mockResolvedValue(undefined);

    const result = await paperService.deletePaperPdf(String(paperId));

    expect(result.dataStatus).toBe("active");
    expect(paperModel.findByIdAndUpdate).toHaveBeenCalledWith(
      String(paperId),
      expect.objectContaining({
        paperStatus: "not-downloaded",
        dataStatus: "active",
      }),
      { new: true },
    );
    expect(storage.deletePdf).toHaveBeenCalledWith(pdfPath);
  });

  it("rejects unauthorized PDF uploads before storage persistence", async () => {
    const paperId = new mongoose.Types.ObjectId();
    paperModel.findById.mockResolvedValue({
      _id: paperId,
      requestedBy: new mongoose.Types.ObjectId(),
      primaryProvider: "user",
      paperStatus: "pending",
      dataStatus: "draft",
      pdfPath: undefined,
    });

    await expect(
      paperService.assertCanUploadPdf(
        String(paperId),
        String(new mongoose.Types.ObjectId()),
        "student",
      ),
    ).rejects.toThrow("You can only upload a PDF after the request is approved");
  });
});

describe("paperService.getById visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDetailQuery(result: Record<string, unknown> | null) {
    const query = {
      populate: vi.fn(),
      lean: vi.fn().mockResolvedValue(result),
    };
    query.populate.mockReturnValue(query);
    paperModel.findOne.mockReturnValue(query);
    return query;
  }

  function paperFixture(overrides: Record<string, unknown> = {}) {
    return {
      _id: new mongoose.Types.ObjectId(),
      externalIds: { doi: "10.1000/safe-detail" },
      title: "Safe paper detail",
      authors: [],
      publicationYear: 2025,
      citationCount: 10,
      keywords: [],
      topics: [],
      primaryProvider: "user",
      dataStatus: "active",
      dataQualityScore: 0.8,
      isAiAnalyzable: true,
      paperStatus: "downloaded",
      pdfPath: "r2://private-bucket/papers/private-key.pdf",
      uploadRewardedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("returns active paper details publicly with storage and PII redacted", async () => {
    const requestedBy = {
      _id: new mongoose.Types.ObjectId(),
      fullName: "Requester",
      email: "requester@example.com",
      institution: "FPT University",
    };
    const raw = paperFixture({ requestedBy, rejectionReason: "internal note" });
    mockDetailQuery(raw);

    const result = await paperService.getById(String(raw._id));

    expect(paperModel.findOne).toHaveBeenCalledWith({
      _id: raw._id,
      $or: [{ dataStatus: "active" }],
    });
    expect(result).toMatchObject({
      id: String(raw._id),
      title: "Safe paper detail",
      dataStatus: "active",
      pdfAvailable: true,
      pdfPath: `/api/v1/papers/${raw._id}/pdf-url`,
      paperStatus: "downloaded",
    });
    expect(result?.pdfPath).not.toContain("private-bucket");
    expect(result?.pdfPath).not.toContain("private-key.pdf");
    expect(result).not.toHaveProperty("requestedBy");
    expect(result).not.toHaveProperty("uploadedBy");
    expect(result).not.toHaveProperty("rejectionReason");
    expect(result).not.toHaveProperty("uploadRewardedAt");
  });

  it.each([
    { label: "draft", dataStatus: "draft", paperStatus: "pending" },
    { label: "rejected", dataStatus: "archived", paperStatus: "rejected" },
  ])(
    "does not expose a non-active $label paper to an anonymous caller",
    async ({ dataStatus, paperStatus }) => {
      const paperId = new mongoose.Types.ObjectId();
      mockDetailQuery(null);

      const result = await paperService.getById(String(paperId));

      expect(result).toBeNull();
      expect(paperModel.findOne).toHaveBeenCalledWith({
        _id: paperId,
        $or: [{ dataStatus: "active" }],
      });
      expect(dataStatus).not.toBe("active");
      expect(["pending", "rejected"]).toContain(paperStatus);
    },
  );

  it("allows the requester to view a draft workflow without PII or storage keys", async () => {
    const requesterId = new mongoose.Types.ObjectId();
    const raw = paperFixture({
      dataStatus: "draft",
      paperStatus: "pending",
      requestedBy: {
        _id: requesterId,
        fullName: "Paper Requester",
        email: "private@example.com",
        institution: "FPT University",
        role: "student",
      },
      rejectionReason: undefined,
    });
    mockDetailQuery(raw);

    const result = await paperService.getById(String(raw._id), {
      userId: String(requesterId),
      role: "student",
    });

    expect(result).toMatchObject({
      dataStatus: "draft",
      paperStatus: "pending",
      requestedBy: {
        _id: String(requesterId),
        fullName: "Paper Requester",
        university: "FPT University",
      },
      pdfAvailable: true,
      pdfPath: `/api/v1/papers/${raw._id}/pdf-url`,
    });
    expect(result?.pdfPath).not.toContain("private-bucket");
    expect(result?.requestedBy).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("uploadRewardedAt");
  });

  it("allows an admin to inspect a rejected workflow with sensitive fields redacted", async () => {
    const raw = paperFixture({
      dataStatus: "archived",
      paperStatus: "rejected",
      rejectionReason: "Invalid metadata",
      uploadedBy: {
        _id: new mongoose.Types.ObjectId(),
        fullName: "Uploader",
        email: "uploader@example.com",
      },
    });
    mockDetailQuery(raw);

    const result = await paperService.getById(String(raw._id), {
      userId: String(new mongoose.Types.ObjectId()),
      role: "admin",
    });

    expect(paperModel.findOne).toHaveBeenCalledWith({ _id: raw._id });
    expect(result).toMatchObject({
      dataStatus: "archived",
      paperStatus: "rejected",
      rejectionReason: "Invalid metadata",
      uploadedBy: { fullName: "Uploader" },
      pdfPath: `/api/v1/papers/${raw._id}/pdf-url`,
    });
    expect(result?.pdfPath).not.toContain("private-bucket");
    expect(result?.uploadedBy).not.toHaveProperty("email");
  });
});
