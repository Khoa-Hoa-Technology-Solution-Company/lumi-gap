import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { paperRouter } from "../modules/papers/paper.routes.js";
import { syncRouter } from "../modules/api-sync/sync.routes.js";
import { searchRouter } from "../modules/search/search.routes.js";
import { embeddingRouter } from "../modules/embeddings/embedding.routes.js";
import { trendRouter } from "../modules/trends/trend.routes.js";
import { reportRouter } from "../modules/reports/report.routes.js";
import { gapsRouter } from "../modules/gaps/gaps.routes.js";
import { bookmarkRouter } from "../modules/bookmarks/bookmark.routes.js";
import { analyticsRouter } from "../modules/analytics/analytics.routes.js";
import { qualityRouter } from "../modules/quality/quality.routes.js";
import { adminRouter } from "../modules/admin/admin.routes.js";
import { notificationRouter } from "../modules/notifications/notification.routes.js";
import { projectRouter } from "../modules/projects/project.routes.js";
import { homeRouter } from "../modules/home/home.routes.js";
import { creditRouter } from "../modules/credits/credit.routes.js";
import { pipelineRouter } from "../modules/pipeline/pipeline.routes.js";
import { evaluationRouter } from "../modules/evaluation/evaluation.routes.js";
import { communityRouter } from "../modules/communities/community.routes.js";
import { forumRouter, gapDiscussionRouter } from "../modules/forum/forum.routes.js";
import { recruitmentRouter } from "../modules/recruitment/recruitment.routes.js";
import { submissionRouter } from "../modules/submissions/submission.routes.js";
import { workspaceRouter } from "../modules/workspaces/workspace.routes.js";
import { aiRunRouter } from "../modules/ai-jobs/ai-run.routes.js";
import {
  academicProfileAdminRouter,
  academicProfileRouter,
} from "../modules/academic-profiles/academic-profile.routes.js";
import {
  contributionRouter,
  humanReviewRouter,
  reviewAvailabilityRouter,
  reviewOpportunityRouter,
  reviewRequestRouter,
  reviewTemplateRouter,
} from "../modules/reviews/review.routes.js";
import { literatureRouter } from "../modules/literature/literature.routes.js";
import { userAiRouter } from "../modules/user-ai/user-ai.routes.js";

export const apiRouter: Router = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/user-ai", userAiRouter);
apiRouter.use("/home", homeRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/papers", paperRouter);
apiRouter.use("/search", searchRouter); // Phase B — semantic search
apiRouter.use("/trends", trendRouter); // Phase B/C — publication trends
apiRouter.use("/reports", reportRouter); // Phase C — RAG analytical reports
apiRouter.use("/gaps", gapDiscussionRouter);
apiRouter.use("/gaps", gapsRouter); // Phase D — research gaps
apiRouter.use("/communities", communityRouter);
apiRouter.use("/forum", forumRouter);
apiRouter.use("/openings", recruitmentRouter);
apiRouter.use("/submissions", submissionRouter);
apiRouter.use("/workspaces", workspaceRouter);
apiRouter.use("/ai-runs", aiRunRouter);
apiRouter.use("/academic-profiles", academicProfileRouter);
apiRouter.use("/review-availability", reviewAvailabilityRouter);
apiRouter.use("/review-opportunities", reviewOpportunityRouter);
apiRouter.use("/reviews", humanReviewRouter);
apiRouter.use("/review-requests", reviewRequestRouter);
apiRouter.use("/review-templates", reviewTemplateRouter);
apiRouter.use("/contributions", contributionRouter);
apiRouter.use("/literature", literatureRouter);
apiRouter.use("/bookmarks", bookmarkRouter); // Sprint 3 — bookmarks
apiRouter.use("/analytics", analyticsRouter); // Phase D — search analytics
apiRouter.use("/quality", qualityRouter); // Quality & Feedback — LLM-judge + user ratings
apiRouter.use("/notifications", notificationRouter);
apiRouter.use("/credits", creditRouter);
apiRouter.use("/admin", syncRouter); // /admin/sync
apiRouter.use("/admin", embeddingRouter); // /admin/embed
apiRouter.use("/admin", pipelineRouter); // /admin/pipeline/status
apiRouter.use("/admin", evaluationRouter); // /admin/evaluation/summary
apiRouter.use("/admin", adminRouter); // /admin/users, /admin/stats — user management
apiRouter.use("/admin", academicProfileAdminRouter);
