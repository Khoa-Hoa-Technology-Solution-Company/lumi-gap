import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ env: { SYNC_FREE_TEXT_ENABLED: false }, add: vi.fn() }));

vi.mock("../../../config/env.js", () => ({ env: m.env }));
vi.mock("../../../infrastructure/queue.js", () => ({
  apiSyncQueue: { add: m.add }, corpusValidationQueue: {}, openAlexIngestQueue: {},
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: vi.fn() }));
vi.mock("../scale/ingest-campaign-admin.service.js", () => ({ ingestCampaignAdminService: {} }));
vi.mock("../scale/ingest-campaign.service.js", () => ({ ingestCampaignService: {} }));
vi.mock("../scale/openalex-preflight.service.js", () => ({ openAlexPreflightService: {} }));
vi.mock("../scale/openalex-campaign-planner.service.js", () => ({ openAlexCampaignPlannerService: {} }));
vi.mock("../scale/tag-campaign.service.js", () => ({ tagCampaignService: {} }));
vi.mock("../scale/corpus-validation.service.js", () => ({ CORPUS_VALIDATOR_VERSION: "test", corpusValidationService: {} }));

import { syncController } from "../sync.controller.js";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const body = { searchText: "anything", yearFrom: 2022, maxPages: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  m.env.SYNC_FREE_TEXT_ENABLED = false;
});

describe("free-text sync", () => {
  it("is refused by default and queues nothing", async () => {
    await expect(syncController.trigger({ body } as Request<unknown, unknown, typeof body>, response() as unknown as Response))
      .rejects.toMatchObject({ statusCode: 403, code: "SYNC_FREE_TEXT_DISABLED" });
    expect(m.add).not.toHaveBeenCalled();
  });

  it("still queues a sync when the debug flag is on", async () => {
    m.env.SYNC_FREE_TEXT_ENABLED = true;
    m.add.mockResolvedValue({ id: "j1" });
    const res = response();
    await syncController.trigger({ body } as Request<unknown, unknown, typeof body>, res as unknown as Response);
    expect(m.add).toHaveBeenCalledWith("manual-sync", body);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("tells the page whether to offer it", () => {
    const res = response();
    syncController.options({} as Request, res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { freeTextSyncEnabled: false } });
  });
});
