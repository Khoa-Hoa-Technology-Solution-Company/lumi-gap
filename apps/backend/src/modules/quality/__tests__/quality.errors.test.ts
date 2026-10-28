import { describe, expect, it } from "vitest";
import { AppError } from "../../../common/exceptions/app-error.js";
import { LlmUnavailableError } from "../../llm/gemini.client.js";
import { isTransientProviderFailure, toQualityError } from "../quality.errors.js";

describe("quality error mapping", () => {
  it("treats an overloaded model as a transient failure the job retries", () => {
    const error = new LlmUnavailableError("gemini-test", 503);
    expect(isTransientProviderFailure(error)).toBe(true);
    expect(toQualityError(error)).toMatchObject({ statusCode: 503, code: "AI_EVALUATION_BUSY" });
  });

  it("passes other AppErrors through unchanged", () => {
    const error = AppError.notFound("Paper not found");
    expect(isTransientProviderFailure(error)).toBe(false);
    expect(toQualityError(error)).toBe(error);
  });
});
