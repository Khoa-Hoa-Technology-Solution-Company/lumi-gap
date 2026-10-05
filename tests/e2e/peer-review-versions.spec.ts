import { expect, test, type Page } from "@playwright/test";

const articleId = "10000000-0000-4000-8000-000000000001";
const reviewerId = "20000000-0000-4000-8000-000000000001";
const user = { id: "30000000-0000-4000-8000-000000000001", fullName: "Student Author", email: "author@example.test", role: "user", systemRole: "USER", accountStatus: "ACTIVE", participantScope: "INTERNAL", academicProfileType: "student", capabilities: ["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"], onboarding: { completed: true } };
const review = (revisionId: string, roundNumber: number, weightedScore: number) => ({ id: `review-${roundNumber}`, reviewerId, reviewerName: "Researcher Nguyen", reviewerAcademicRole: "RESEARCHER", revisionId, roundNumber, templateVersionId: "same-rubric", weightedScore, overallAssessment: roundNumber === 1 ? "MAJOR_REVISION" : "STRONG", keyStrengths: "Clear question", keyConcerns: null, overallComment: "Methods reviewed", submittedAt: `2026-10-0${roundNumber}T10:00:00Z`, responses: [{ criterionKey: "method", comment: "Sampling assessed", evidence: "Section 2", assessment: null, score: weightedScore, notApplicable: false }], requiredRevisions: [] });

async function mockArticle(page: Page, canManage = true) {
  const versions = [3, 2, 1].map((number) => ({ id: `v${number}`, revisionNumber: number, contentType: "MARKDOWN", contentSnapshot: `# Manuscript v${number}`, checksumSha256: "a".repeat(64), sizeBytes: 50, sourceRevisionId: number > 1 ? `v${number - 1}` : null, responseToReview: `Changes for v${number}`, createdAt: `2026-10-0${number}T10:00:00Z`, hasPdf: false, reviews: number === 3 ? [] : [review(`v${number}`, number, number + 1)] }));
  const history = { canManage, openForReview: false, currentRevisionId: "v3", currentRevisionNumber: 3, latestReviewedRevisionId: "v2", versions, contributions: [{ reviewerId, name: "Researcher Nguyen", type: "REVIEW", rounds: [1, 2].map((number) => ({ reviewId: `review-${number}`, revisionId: `v${number}`, roundNumber: number, submittedAt: `2026-10-0${number}T10:00:00Z`, academicRole: "RESEARCHER" })) }] };
  await page.addInitScript((authUser) => { localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user: authUser, tokens: { accessToken: "ui-test", refreshToken: "ui-test" } } })); }, user);
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { user };
    else if (path.endsWith(`/submissions/${articleId}/history`)) data = history;
    else if (path.endsWith(`/submissions/${articleId}/versions`)) {
      const payload = route.request().postDataJSON();
      expect(payload.expectedRevisionNumber).toBe(history.currentRevisionNumber);
      const source = versions.find((item) => item.id === payload.sourceRevisionId);
      history.currentRevisionNumber += 1; history.currentRevisionId = `v${history.currentRevisionNumber}`;
      versions.unshift({ ...versions[0], id: history.currentRevisionId, revisionNumber: history.currentRevisionNumber, sourceRevisionId: source?.id ?? "v3", contentSnapshot: source?.contentSnapshot ?? payload.content, reviews: [], responseToReview: payload.summary });
      data = versions[0];
    } else if (path.endsWith(`/submissions/${articleId}/revisions`)) data = versions.map((version) => ({ ...version, _id: version.id }));
    else if (path.endsWith(`/submissions/${articleId}`)) data = { _id: articleId, title: "Community peer review manuscript", status: "revised", submissionType: "RESEARCH_PAPER", projectId: "project", currentRevisionNumber: history.currentRevisionNumber, researchQuestions: [], keywords: [] };
    await route.fulfill({ json: { success: true, data } });
  });
  return history;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 320, height: 800 }]) {
  test(`versions, unreviewed state and comparison fit ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await mockArticle(page);
    await page.goto(`/submissions/${articleId}`);
    await expect(page.getByRole("heading", { name: "Phiên bản và tiến trình" })).toBeVisible();
    await expect(page.getByText("Chưa được review · Chưa có điểm")).toBeVisible();
    await page.getByLabel("Phiên bản trước").selectOption("v1");
    await page.getByLabel("Phiên bản sau").selectOption("v2");
    await expect(page.getByRole("cell", { name: "+1.00", exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Đóng góp phản biện" })).toBeVisible();
    await page.getByText("Đối chiếu nội dung v1 / v2", { exact: true }).click();
    await expect(page.getByLabel("Thay đổi nội dung Markdown")).toContainText("+ # Manuscript v2");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/peer-review-${viewport.width}.png`, fullPage: true });
  });
}

test("restore keeps previous versions and creates a new unreviewed version", async ({ page }) => {
  const history = await mockArticle(page);
  await page.goto(`/submissions/${articleId}`);
  await page.getByRole("button", { name: "Khôi phục thành bản mới" }).last().click();
  await expect(page.getByRole("dialog")).toContainText("Khôi phục v1");
  await page.getByRole("button", { name: "Lưu phiên bản mới" }).click();
  await expect(page.getByText("Bản mới nhất: v4", { exact: false })).toBeVisible();
  expect(history.versions[0].contentSnapshot).toBe("# Manuscript v1");
  expect(history.versions[0].reviews).toHaveLength(0);
  expect(history.versions).toHaveLength(4);
});

test("read-only viewers can inspect versions without author controls", async ({ page }) => {
  await mockArticle(page, false); await page.goto(`/submissions/${articleId}`);
  await expect(page.getByRole("heading", { name: "Phiên bản và tiến trình" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Khôi phục thành bản mới" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tạo bản Markdown mới" })).toHaveCount(0);
  await page.getByRole("button", { name: "Xem nội dung" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("# Manuscript v3");
});

test("reviewer verifies author responses and autosaves the pinned resubmitted round", async ({ page }) => {
  await mockArticle(page, false);
  const workspace = {
    assignment: { id: "assignment", status: "accepted", submissionId: { id: articleId, title: "Pinned manuscript", status: "under_review", currentRevisionNumber: 3 } },
    request: { id: "request", status: "RESUBMITTED" }, artifactRevision: { id: "v2", revisionNumber: 2, contentType: "PDF" },
    responses: [], requiredRevisions: [], roundNumber: 2,
    criteria: [{ key: "method", title: "Method evidence", order: 0, required: true, allowNotApplicable: false, levels: [] }],
    previousRevisionItems: [{ id: "issue", description: "Explain sampling", status: "ADDRESSED", responses: [{ submissionRevisionId: "v2", responseText: "Sampling added in section 2", status: "ADDRESSED" }] }],
  };
  let saved: { expectedRevisionId?: string; expectedRoundNumber?: number; responses?: unknown[] } | undefined;
  await page.route("**/api/v1/reviews/assignment", async (route) => {
    if (route.request().method() === "PUT") saved = route.request().postDataJSON();
    await route.fulfill({ json: { success: true, data: workspace } });
  });
  await page.route("**/api/v1/review-requests/request/revision-items/issue", async (route) => {
    expect(route.request().postDataJSON().status).toBe("ACCEPTED"); workspace.previousRevisionItems[0].status = "ACCEPTED";
    await route.fulfill({ status: 204 });
  });
  await page.goto("/reviews/assignment");
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Round 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download assigned PDF" })).toBeVisible();
  await expect(page.getByText("Sampling added in section 2", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Accept change" }).click();
  await page.getByRole("textbox", { name: "Response", exact: true }).fill("Sampling checked against section 2.");
  await expect.poll(() => saved?.expectedRevisionId).toBe("v2");
  expect(saved?.expectedRoundNumber).toBe(2);
});
