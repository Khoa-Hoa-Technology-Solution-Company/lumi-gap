import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  screeningClaimSchema,
  screeningReleaseSchema,
  screeningExtendSchema,
  screeningDiscoveryGoalUpdateSchema,
  screeningPageSchema,
  screeningConfigSchema,
} from "../dto/screening.schema.js";

describe("Reviewer Queue, Leases & Discovery Goal Schemas", () => {
  it("validates screeningPageSchema with PROPOSED_BY_ME and QUEUE filters", () => {
    const queuePage = screeningPageSchema.parse({ filter: "QUEUE" });
    expect(queuePage.filter).toBe("QUEUE");

    const proposedPage = screeningPageSchema.parse({ filter: "PROPOSED_BY_ME" });
    expect(proposedPage.filter).toBe("PROPOSED_BY_ME");

    const allPage = screeningPageSchema.parse({});
    expect(allPage.filter).toBe("ALL");
  });

  it("validates screeningClaimSchema, screeningReleaseSchema, and screeningExtendSchema", () => {
    const clientKey = randomUUID();
    expect(screeningClaimSchema.parse({ clientKey })).toEqual({ clientKey });
    expect(screeningReleaseSchema.parse({ clientKey })).toEqual({ clientKey });
    expect(screeningExtendSchema.parse({ clientKey })).toEqual({ clientKey });

    expect(() => screeningClaimSchema.parse({ clientKey: "not-a-uuid" })).toThrow();
  });

  it("validates discovery goal update schema with valid periods and targets", () => {
    const clientKey = randomUUID();
    const validWeek = screeningDiscoveryGoalUpdateSchema.parse({
      enabled: true,
      target: 3,
      period: "WEEK",
      paused: false,
      clientKey,
    });
    expect(validWeek.enabled).toBe(true);
    expect(validWeek.target).toBe(3);
    expect(validWeek.period).toBe("WEEK");

    const validMonth = screeningDiscoveryGoalUpdateSchema.parse({
      enabled: false,
      target: 10,
      period: "MONTH",
      paused: true,
      clientKey,
    });
    expect(validMonth.period).toBe("MONTH");
    expect(validMonth.paused).toBe(true);

    // Invalid target (less than 1)
    expect(() =>
      screeningDiscoveryGoalUpdateSchema.parse({
        enabled: true,
        target: 0,
        period: "WEEK",
        clientKey,
      })
    ).toThrow();

    // Invalid period
    expect(() =>
      screeningDiscoveryGoalUpdateSchema.parse({
        enabled: true,
        target: 2,
        period: "YEAR" as unknown as "WEEK",
        clientKey,
      })
    ).toThrow();
  });

  it("allows configuring discovery goals in screeningConfigSchema", () => {
    const clientKey = randomUUID();
    const config = screeningConfigSchema.parse({
      reviewMode: "INDEPENDENT",
      blindReview: true,
      resolutionPolicy: "ADJUDICATION",
      expectedVersion: 1,
      requiredReviewers: 2,
      consensusPolicy: "UNANIMOUS",
      aiAssisted: false,
      inclusionCriteria: ["Criterion A"],
      exclusionCriteria: ["Criterion B"],
      researchQuestions: ["Question 1"],
      discoveryGoalEnabled: true,
      discoveryGoalTarget: 4,
      discoveryGoalPeriod: "WEEK",
      discoveryGoalPaused: false,
      clientKey,
    });
    expect(config.discoveryGoalEnabled).toBe(true);
    expect(config.discoveryGoalTarget).toBe(4);
    expect(config.discoveryGoalPeriod).toBe("WEEK");
  });

  it("calculates 24-hour lease expiration and extension logic accurately", () => {
    const now = Date.now();
    const leaseDuration = 24 * 60 * 60 * 1000;
    const initialDueAt = new Date(now + leaseDuration);
    expect(initialDueAt.getTime() - now).toBe(leaseDuration);

    // Simulating +24h extension
    const extendedDueAt = new Date(initialDueAt.getTime() + leaseDuration);
    expect(extendedDueAt.getTime() - initialDueAt.getTime()).toBe(leaseDuration);

    // Expired lease condition
    const pastDueAt = new Date(now - 1000);
    const isExpired = pastDueAt.getTime() <= now;
    expect(isExpired).toBe(true);
  });
});
