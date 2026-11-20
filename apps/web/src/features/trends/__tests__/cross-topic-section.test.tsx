import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CrossTopicSection } from "../components/cross-topic-section";

describe("CrossTopicSection", () => {
  it("renders nothing when the overview has no cross-topic analysis", () => {
    for (const analysis of [null, undefined]) {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <CrossTopicSection analysis={analysis} getTopicTrendTarget={(topic) => `/trends/${topic}`} />
        </MemoryRouter>,
      );
      expect(html).toBe("");
    }
  });
});
