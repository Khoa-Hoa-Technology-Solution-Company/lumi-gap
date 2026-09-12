import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "../readiness.js";

describe("evaluateReadiness", () => {
  it("reports ready when every dependency responds", async () => {
    const result = await evaluateReadiness({
      mongo: async () => undefined,
      redis: async () => undefined,
    });

    expect(result.status).toBe("ready");
    expect(result.dependencies.mongo.ok).toBe(true);
    expect(result.dependencies.redis.ok).toBe(true);
  });

  it("reports not ready without exposing probe errors", async () => {
    const result = await evaluateReadiness({
      mongo: async () => {
        throw new Error("sensitive mongo detail");
      },
      redis: async () => undefined,
    });

    expect(result.status).toBe("not_ready");
    expect(result.dependencies.mongo.ok).toBe(false);
    expect(result).not.toHaveProperty("error");
  });

  it("times out a dependency probe", async () => {
    const result = await evaluateReadiness(
      {
        mongo: () => new Promise(() => undefined),
        redis: async () => undefined,
      },
      5,
    );

    expect(result.status).toBe("not_ready");
    expect(result.dependencies.mongo.ok).toBe(false);
  });
});
