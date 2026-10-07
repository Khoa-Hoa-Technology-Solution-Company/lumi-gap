import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../../infrastructure/logger.js";

// Importing the service must not open real queue connections.
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

import { narrowStatus, narrowVisibility } from "../community.service.js";

describe("narrowStatus", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["ACTIVE", "ARCHIVED", "PENDING_APPROVAL", "REJECTED"])("keeps the valid status %s", (status) => {
    const warn = vi.spyOn(logger, "warn");
    expect(narrowStatus(status)).toBe(status);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["SUSPENDED", ""])("fails closed to read-only ARCHIVED for %j and logs a warning", (status) => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    expect(narrowStatus(status)).toBe("ARCHIVED");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("narrowVisibility", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps public and private without logging", () => {
    const warn = vi.spyOn(logger, "warn");
    expect(narrowVisibility("public")).toBe("public");
    expect(narrowVisibility("private")).toBe("private");
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats unknown values as private and logs a warning", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    expect(narrowVisibility("weird")).toBe("private");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
