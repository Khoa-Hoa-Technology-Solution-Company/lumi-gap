import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { AcademicProfileModel } from "../src/modules/academic-profiles/academic-profile.model.js";
import { AiPreReviewModel } from "../src/modules/submissions/ai-pre-review.model.js";
import { ReviewerAssignmentModel, SubmissionModel, SubmissionRevisionModel } from "../src/modules/submissions/submission.model.js";
import { defaultReviewCriteria } from "../src/modules/reviews/review.constants.js";
import {
  ContributionModel,
  HumanReviewModel,
  ReviewConflictModel,
  ReviewCriterionModel,
  ReviewResponseModel,
  ReviewTemplateModel,
} from "../src/modules/reviews/review.model.js";
import { GapEvidenceRecordModel, GapValidationModel } from "../src/modules/gaps/models/gap-validation.model.js";
import { ResearchGapModel } from "../src/modules/gaps/models/research-gap.model.js";
import { ProjectContributionProposalModel } from "../src/modules/projects/models/project-contribution.model.js";
import { CorpusPaperModel, LiteratureCorpusModel } from "../src/modules/literature/literature.model.js";

async function main() {
  await connectMongo();
  const [maximumBackfill, recommendationBackfill, visibilityBackfill] = await Promise.all([
    AcademicProfileModel.updateMany(
      { "reviewAvailability.enabled": { $exists: true }, "reviewAvailability.maximumActiveReviews": { $exists: false } },
      { $set: { "reviewAvailability.maximumActiveReviews": 3 } },
      { runValidators: true },
    ),
    AcademicProfileModel.updateMany(
      { "reviewAvailability.enabled": { $exists: true }, "reviewAvailability.autoRecommendationEnabled": { $exists: false } },
      { $set: { "reviewAvailability.autoRecommendationEnabled": true } },
      { runValidators: true },
    ),
    AcademicProfileModel.updateMany(
      { profileVisibility: { $exists: false } },
      { $set: { profileVisibility: "PUBLIC" } },
      { runValidators: true },
    ),
  ]);

  const template = await ReviewTemplateModel.findOneAndUpdate(
    { name: "LumiGap Academic Peer Review", version: 1 },
    { $set: { description: "Qualitative evidence-led peer review rubric", active: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Promise.all(defaultReviewCriteria.map(([key, label, description], order) => ReviewCriterionModel.updateOne(
    { templateId: template._id, key },
    { $set: { label, description, order } },
    { upsert: true, runValidators: true },
  )));

  await Promise.all([
    AcademicProfileModel.syncIndexes(), SubmissionModel.syncIndexes(), SubmissionRevisionModel.syncIndexes(),
    ReviewerAssignmentModel.syncIndexes(), AiPreReviewModel.syncIndexes(), ReviewConflictModel.syncIndexes(),
    ReviewTemplateModel.syncIndexes(), ReviewCriterionModel.syncIndexes(), HumanReviewModel.syncIndexes(),
    ReviewResponseModel.syncIndexes(), ContributionModel.syncIndexes(),
    ResearchGapModel.syncIndexes(), GapEvidenceRecordModel.syncIndexes(), GapValidationModel.syncIndexes(),
    ProjectContributionProposalModel.syncIndexes(),
    LiteratureCorpusModel.syncIndexes(), CorpusPaperModel.syncIndexes(),
  ]);
  logger.info({
    matchedProfiles: maximumBackfill.matchedCount + recommendationBackfill.matchedCount + visibilityBackfill.matchedCount,
    templateId: template.id,
  }, "research review migration completed");
  await disconnectMongo();
}

main().catch(async (error) => {
  logger.fatal({ err: error }, "research review migration failed");
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
