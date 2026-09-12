import { describe, expect, it } from "vitest";
import {
  getAiActionCost,
  resolveReportCreditCost,
  AI_CREDIT_COSTS,
} from "../credit-policy.js";

describe("Credit Policy", () => {
  describe("getAiActionCost", () => {
    it("should return the correct cost for standard actions", () => {
      expect(getAiActionCost("search_rerank")).toBe(5);
      expect(getAiActionCost("fast_report")).toBe(20);
      expect(getAiActionCost("standard_report")).toBe(50);
      expect(getAiActionCost("deep_mcp_report")).toBe(100);
      expect(getAiActionCost("generate_gaps")).toBe(30);
      expect(getAiActionCost("generate_directions")).toBe(15);
      expect(getAiActionCost("project_chat_message")).toBe(1);
    });

    it("should return 0 for free actions", () => {
      expect(getAiActionCost("semantic_search")).toBe(0);
      expect(getAiActionCost("trends_deterministic")).toBe(0);
      expect(getAiActionCost("paper_request")).toBe(0);
    });
  });

  describe("resolveReportCreditCost", () => {
    it("should resolve deep_mcp_report cost if deepAnalysis is true", () => {
      const resolved = resolveReportCreditCost({ deepAnalysis: true });
      expect(resolved.action).toBe("deep_mcp_report");
      expect(resolved.cost).toBe(100);
    });

    it("should resolve deep_mcp_report even if both deepAnalysis and fast are true", () => {
      const resolved = resolveReportCreditCost({ deepAnalysis: true, fast: true });
      expect(resolved.action).toBe("deep_mcp_report");
      expect(resolved.cost).toBe(100);
    });

    it("should resolve fast_report if fast is true and deepAnalysis is false/undefined", () => {
      const resolved = resolveReportCreditCost({ fast: true });
      expect(resolved.action).toBe("fast_report");
      expect(resolved.cost).toBe(20);
    });

    it("should resolve standard_report by default", () => {
      const resolved = resolveReportCreditCost({});
      expect(resolved.action).toBe("standard_report");
      expect(resolved.cost).toBe(50);
    });
  });
});
