// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SubmissionIntroductionView } from "../components/submission-introduction-view";

it("keeps existing formatted introductions and older plain summaries readable", () => {
  const markup = renderToStaticMarkup(<SubmissionIntroductionView content={"## Objectives\n\n**Compare** feedback.\n\n- Review evidence\n- Discuss findings"} />);
  expect(markup).toContain("<h2>Objectives</h2>");
  expect(markup).toContain("<strong>Compare</strong>");
  expect(markup).toContain("<li>Review evidence</li>");
  expect(markup).not.toContain("## Objectives");
  expect(renderToStaticMarkup(<SubmissionIntroductionView content="An older plain introduction." />)).toContain("An older plain introduction.");
});

it("blocks embedded HTML, unsafe links and remote images in saved introductions", () => {
  const markup = renderToStaticMarkup(<SubmissionIntroductionView content={'## Overview\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n![tracker](https://example.org/tracker.png)\n\n[source](https://example.org/paper)'} />);
  expect(markup).not.toContain("<script");
  expect(markup).not.toContain('href="javascript:');
  expect(markup).not.toContain("<img");
  expect(markup).toContain('href="https://example.org/paper"');
  expect(markup).toContain('rel="noopener noreferrer"');
});
