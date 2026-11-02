import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScreeningEventHub, screeningEventHub } from "../screening.events.js";
import { screeningController } from "../screening.controller.js";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), session: vi.fn() }));
vi.mock("../screening.service.js", () => ({ screeningService: { detail: mocks.detail } }));
vi.mock("../../../common/middleware/auth.js", () => ({ assertLiveRequestSession: mocks.session }));
vi.mock("../screening-case.service.js", () => ({ screeningCaseService: {} }));
vi.mock("../library-assessment.service.js", () => ({ libraryAssessmentService: {} }));
vi.mock("../project-analysis-set.service.js", () => ({ projectAnalysisSetService: {} }));
vi.mock("../screening-ai.service.js", () => ({ screeningAiService: {} }));

const event = { type: "comment" as const, projectId: "project", roundId: "round", occurredAt: "2026-11-02T07:00:00Z" };
let req: Request, res: Response & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.detail.mockResolvedValue({}); mocks.session.mockResolvedValue(undefined);
  req = Object.assign(new EventEmitter(), { params: { id: "project", roundId: "round" }, user: { sub: "actor" }, headers: {} }) as unknown as Request;
  res = Object.assign(new EventEmitter(), { status: vi.fn().mockReturnThis(), setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn() }) as unknown as typeof res;
});
afterEach(() => { req.emit("close"); vi.useRealTimers(); });
async function settle() { await vi.advanceTimersByTimeAsync(0); }

it("isolates rounds and cleans up listeners", () => {
  const hub = new ScreeningEventHub(), a = vi.fn(), b = vi.fn();
  const leave = hub.subscribe("round", a); hub.subscribe("other", b);
  hub.publish(event); expect(a).toHaveBeenCalledWith(event); expect(b).not.toHaveBeenCalled();
  leave(); hub.publish(event); expect(a).toHaveBeenCalledTimes(1);
});
it("checks project access before opening a stream", async () => {
  mocks.detail.mockRejectedValueOnce(new Error("forbidden"));
  await expect(screeningController.streamEvents(req, res)).rejects.toThrow("forbidden");
  expect(res.write).not.toHaveBeenCalled();
});
it("rechecks session and project access before delivering invalidation events", async () => {
  await screeningController.streamEvents(req, res);
  expect(res.write.mock.calls[0]![0]).toContain('"type":"ready"');
  screeningEventHub.publish(event); await settle();
  expect(mocks.session).toHaveBeenCalledWith(req); expect(mocks.detail).toHaveBeenLastCalledWith("project", "actor", "round");
  expect(JSON.parse(String(res.write.mock.calls[1]![0]).slice(6))).toEqual(event);
  mocks.detail.mockRejectedValueOnce(new Error("membership revoked"));
  screeningEventHub.publish(event); await settle(); expect(res.end).toHaveBeenCalledTimes(1);
  const count = res.write.mock.calls.length; screeningEventHub.publish(event); await settle(); expect(res.write).toHaveBeenCalledTimes(count);
});
it("closes and unsubscribes when session expires during a heartbeat", async () => {
  await screeningController.streamEvents(req, res); mocks.session.mockRejectedValueOnce(new Error("expired"));
  await vi.advanceTimersByTimeAsync(25000); expect(res.end).toHaveBeenCalledTimes(1);
  screeningEventHub.publish(event); await settle(); expect(res.write).toHaveBeenCalledTimes(1);
});
