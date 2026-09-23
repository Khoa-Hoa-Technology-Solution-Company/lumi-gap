import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { pdfStorageService } from "../src/infrastructure/pdf-storage.service.js";
import { AcademicProfileModel } from "../src/modules/academic-profiles/academic-profile.model.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";
import { ProjectModel } from "../src/modules/projects/models/project.model.js";
import { ContributionModel, HumanReviewModel, ReviewResponseModel } from "../src/modules/reviews/review.model.js";
import { defaultReviewCriteria } from "../src/modules/reviews/review.constants.js";
import { ReviewerAssignmentModel, SubmissionModel, SubmissionRevisionModel } from "../src/modules/submissions/submission.model.js";
import { ResearchGapModel } from "../src/modules/gaps/models/research-gap.model.js";
import { GapValidationModel } from "../src/modules/gaps/models/gap-validation.model.js";
import { ProjectContributionProposalModel } from "../src/modules/projects/models/project-contribution.model.js";
import { LiteratureCorpusModel } from "../src/modules/literature/literature.model.js";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "LumiGapDemo!2026";

async function upsertUser(email: string, fullName: string, academicProfileType: "student" | "lecturer") {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  return UserModel.findOneAndUpdate(
    { email },
    { $set: { fullName, academicProfileType, institution: "LumiGap Demo University", researchInterests: ["Software Engineering", "LLM evaluation"], isActive: true }, $setOnInsert: { role: "user", passwordHash } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed is disabled in production");
  await connectMongo();
  const [student, lecturer] = await Promise.all([
    upsertUser("student.demo@lumigap.local", "LumiGap Demo Student", "student"),
    upsertUser("lecturer.demo@lumigap.local", "Dr LumiGap Reviewer", "lecturer"),
  ]);
  await AcademicProfileModel.updateOne(
    { userId: lecturer._id },
    { $set: {
      expertiseAreas: ["Software Engineering", "Empirical Software Engineering"],
      reviewAvailability: {
        enabled: true,
        acceptedFields: ["Software Engineering"],
        preferredTopics: ["LLM evaluation", "Requirements Engineering"],
        types: ["RESEARCH_PAPER", "THESIS_DRAFT"],
        maximumActiveReviews: 3,
        preferredReviewWorkload: "2–4 hours",
        autoRecommendationEnabled: true,
        updatedAt: new Date(),
      },
    }, $setOnInsert: { verificationStatus: "SELF_DECLARED" } },
    { upsert: true, runValidators: true },
  );
  await AcademicProfileModel.updateOne({ userId: student._id }, { $setOnInsert: { userId: student._id, verificationStatus: "SELF_DECLARED" } }, { upsert: true });

  const project = await ProjectModel.findOneAndUpdate(
    { ownerId: student._id, title: "Demo: Evidence-backed LLM Requirements Study" },
    { $set: { description: "Development-only workflow data; not an external research claim.", members: [{ targetKind: "User", targetId: student._id, role: "owner" }, { targetKind: "User", targetId: lecturer._id, role: "member" }] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const submission = await SubmissionModel.findOneAndUpdate(
    { createdBy: student._id, title: "Evaluating LLM-assisted requirements analysis in student projects" },
    { $setOnInsert: {
      projectId: project._id, createdBy: student._id, authorIds: [student._id], title: "Evaluating LLM-assisted requirements analysis in student projects",
      abstract: "A development-only manuscript used to exercise the LumiGap review workflow.", submissionType: "RESEARCH_PAPER", researchField: "Software Engineering",
      researchGoal: "Evaluate where human review is still required when LLMs assist requirements analysis.", researchQuestions: ["Which claim types require human validation?"],
      claimedResearchGap: "Industrial and external literature evidence has not been attached to this demo candidate.", claimedContribution: "A transparent evaluation protocol, pending evidence.",
      methodology: "Planned mixed-method evaluation; this seed does not claim completed empirical results.", scope: "Development demo only", keywords: ["LLM evaluation", "Requirements Engineering"],
      expectedReviewWorkload: "2–4 hours", status: "completed", currentRevisionNumber: 1,
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  let revision = await SubmissionRevisionModel.findOne({ submissionId: submission._id, revisionNumber: 1 });
  if (!revision) {
    const demoPdf = Buffer.from("%PDF-1.4\n% LumiGap development seed placeholder\n%%EOF\n", "utf8");
    const stored = await pdfStorageService.savePdf(demoPdf, "lumigap-demo-manuscript.pdf");
    revision = await SubmissionRevisionModel.create({ submissionId: submission._id, revisionNumber: 1, uploadedBy: student._id, storageUri: stored.uri, checksumSha256: crypto.createHash("sha256").update(demoPdf).digest("hex"), sizeBytes: demoPdf.length, originalFileName: "lumigap-demo-manuscript.pdf" });
    submission.currentRevisionId = revision._id;
    await submission.save();
  }
  const assignment = await ReviewerAssignmentModel.findOneAndUpdate(
    { submissionId: submission._id, reviewerId: lecturer._id },
    { $set: { status: "completed", decision: "major_revision", reviewText: "The demo claim requires traceable external evidence before academic acceptance.", completedAt: new Date() }, $setOnInsert: { assignedBy: lecturer._id, anonymousCode: `DEMO-${crypto.randomBytes(8).toString("hex")}`, conflictChecks: { selfOrAuthor: false, declared: false, sameInstitution: false, checkedAt: new Date() } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const review = await HumanReviewModel.findOneAndUpdate(
    { assignmentId: assignment._id },
    { $set: { reviewerId: lecturer._id, submissionId: submission._id, revisionId: revision._id, status: "SUBMITTED", overallComment: "Development example: the workflow is complete, but the academic claim still needs real evidence.", recommendation: "MAJOR_REVISION", submittedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Promise.all(defaultReviewCriteria.map(([key, label]) => ReviewResponseModel.updateOne(
    { reviewId: review._id, criterionKey: key },
    { $set: { comment: `${label}: development seed response; replace with a real reviewer assessment.`, evidence: "No external evidence is asserted by this seed." } },
    { upsert: true, runValidators: true },
  )));
  await ContributionModel.updateOne(
    { sourceReviewAssignmentId: assignment._id },
    { $setOnInsert: { contributorId: lecturer._id, projectId: project._id, submissionId: submission._id, contributionType: "REVIEW", description: "Completed peer review of development demo submission", evidence: `Completed assignment ${assignment.id}`, provenance: "LUMIGAP_REVIEW", verificationStatus: "VERIFIED_BY_LUMIGAP", visibility: "PUBLIC", verifiedBy: lecturer._id, verifiedAt: new Date() } },
    { upsert: true },
  );
  const projectContribution = await ProjectContributionProposalModel.findOneAndUpdate(
    { projectId: project._id, contributorId: lecturer._id, status: "CONFIRMED" },
    { $setOnInsert: {
      roles: ["SUPERVISION", "METHODOLOGY"], description: "Confirmed guidance on methodology for the development demo project",
      evidence: "Internal demo project confirmation only; not external academic evidence.", visibility: "PUBLIC", confirmationRequiredFrom: "CONTRIBUTOR",
      proposedBy: student._id, confirmedBy: lecturer._id, confirmedAt: new Date(),
      history: [{ action: "PROPOSED", actorId: student._id, createdAt: new Date() }, { action: "CONFIRMED", actorId: lecturer._id, createdAt: new Date() }],
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Promise.all(projectContribution.roles.map((role) => ContributionModel.updateOne(
    { sourceProjectContributionId: projectContribution._id, contributionType: role },
    { $setOnInsert: { contributorId: lecturer._id, projectId: project._id, contributionType: role, description: projectContribution.description, evidence: projectContribution.evidence, provenance: "PROJECT_CONFIRMATION", verificationStatus: "VERIFIED_BY_LUMIGAP", visibility: "PUBLIC", verifiedBy: lecturer._id, verifiedAt: projectContribution.confirmedAt, sourceProjectContributionId: projectContribution._id } },
    { upsert: true },
  )));
  const corpus = await LiteratureCorpusModel.findOneAndUpdate(
    { ownerId: student._id, name: "Demo: LLM requirements evidence corpus" },
    { $setOnInsert: { projectId: project._id, topic: "LLM-assisted requirements analysis", researchGoal: "Identify evidence limitations without inventing literature.", domain: "Software Engineering", keywords: ["LLM", "Requirements Engineering"], picoc: { population: "Software teams", intervention: "LLM-assisted requirements analysis", outcome: "Evidence quality", context: "Development demo" }, searchStrategy: "Attach real LumiGap papers manually. This seed intentionally contains no fabricated external papers.", status: "DRAFT" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const gap = await ResearchGapModel.findOneAndUpdate(
    { userId: student._id, title: "Demo candidate: external validation evidence is missing" },
    { $setOnInsert: { topic: "LLM-assisted requirements analysis", normalizedTopic: "llm-assisted requirements analysis", title: "Demo candidate: external validation evidence is missing", description: "The demo corpus contains no external papers proving this limitation.", rationale: "The candidate is useful for testing evidence requests, not as a scholarly conclusion.", source: "standalone", origin: "HUMAN", projectId: project._id, gapType: "EMPIRICAL_VALIDATION_GAP", establishedKnowledge: "No established knowledge is asserted by this development seed.", observedLimitation: "No real literature corpus has been attached.", missingEvidence: "Supporting studies and counter-evidence are both unavailable.", significanceExplanation: "Demonstrates the validation workflow without fabricating research evidence.", suggestedResearchQuestion: "What evidence would be required to evaluate this candidate gap?", validationStatus: "UNDER_VALIDATION", gapConfidence: "LOW", researchPriority: "MODERATE", confidence: 0.3, status: "active" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await GapValidationModel.updateOne(
    { gapId: gap._id, reviewerId: lecturer._id, action: "REQUEST_EVIDENCE" },
    { $setOnInsert: { comment: "Attach real supporting and counter-evidence before asking an expert to validate this candidate." } },
    { upsert: true },
  );
  logger.info({ student: student.email, lecturer: lecturer.email, projectId: project.id, corpusId: corpus.id }, "research review demo data seeded");
  await disconnectMongo();
}

main().catch(async (error) => {
  logger.fatal({ err: error }, "research review demo seed failed");
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
