# Entity Dictionary - Overall Logical ERD (LumiGap)

Companion to `OVERALL_LOGICAL_ERD.drawio` (Chen notation, version 1.0).

**Source of truth.** Entities, attributes and keys come from the Prisma schema in `apps/backend/prisma/*.prisma`. Foreign keys and UNIQUE constraints were replayed from the 139 SQL migrations in `apps/backend/prisma/migrations` on `main` a4b8c28. Most relations are declared only in SQL, not in Prisma. Each entity was also checked for read/write use in `apps/backend/src` services.

**Cardinality rule.** An FK without a UNIQUE constraint gives 1:N. An FK covered by a UNIQUE constraint gives 1:1. A join table with two FKs gives N:M, drawn as one relationship diamond that carries the join table's attributes.

**Status legend.** Every entity in the diagram is *Implemented*: the table exists in the migrations and backend services read or write it. Items that are only *Documented* or *Proposed* are listed at the end and are not drawn.

## Summary

| Domain | Entities |
|---|---|
| D1  Identity & Academic Verification | User, AcademicProfile, AcademicExternalIdentity, Affiliation, Institution, VerificationEvidence (6) |
| D2  Scholarly Corpus | Paper, Author, Journal, ResearchTopic (4) |
| D3  Research Analysis (AI) | Report, GapAnalysis, ResearchGap, GapValidation (4) |
| D4  Projects & Collaboration | Project, ResearchPlan, ProjectTask, MentorshipRequest, MentorRelationship, RecruitmentOpening, RecruitmentApplication (7) |
| D5  Manuscript & Peer Review | DraftWorkspace, Submission, SubmissionRevision, AiPreReview, ReviewRequest, ReviewerAssignment, HumanReview, ReviewTemplate, ReviewTemplateVersion (9) |
| D6  Community & Forum | Community, ForumPost, ForumComment, ContentReport (4) |
| D7  Credits & Payments | CreditTransaction, PaymentOrder (2) |
| D8  Notifications & System Operations | Notification, AuditLog, UserAiConnection (3) |

Totals: **39 entities**, **63 relationships** (5 x 1:1, 50 x 1:N, 8 x N:M), **8 domains**.

## D1  Identity & Academic Verification

### User

- **Table:** `users` (Prisma file `identity.prisma`)
- **Purpose:** Account of every person on the platform: sign-in identity, platform role, system role, account status and the current credit balance.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `email`, `systemRole`, `accountStatus`
- **Other important attributes:** `fullName`, `role`, `credits`
- **Unique:** (email); (googleId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `accountStatusChangedById` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *has profile* (1:1) with AcademicProfile; *holds* (1:N) with Affiliation; *submits evidence* (1:N) with VerificationEvidence; *requests report* (1:N) with Report; *runs analysis* (1:N) with GapAnalysis; *validates* (1:N) with GapValidation; *has ledger entry* (1:N) with CreditTransaction; *places order* (1:N) with PaymentOrder; *receives* (1:N) with Notification; *performs* (1:N) with AuditLog; *configures* (1:N) with UserAiConnection; *owns* (1:N) with Project; *is member of* (N:M) with Project; *is invited as mentor* (1:N) with MentorshipRequest; *applies* (1:N) with RecruitmentApplication; *reviews as* (1:N) with ReviewerAssignment; *joins* (N:M) with Community; *authors post* (1:N) with ForumPost; *writes comment* (1:N) with ForumComment; *files report* (1:N) with ContentReport

### AcademicProfile

- **Table:** `academic_profiles` (Prisma file `identity.prisma`)
- **Purpose:** Public academic profile of one user (1:1): handle, academic position and the verification status of identity, e-mail, affiliation, position and ORCID.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `publicHandle`, `primaryPosition`
- **Other important attributes:** `roleVerificationStatus`
- **Unique:** (userId); (publicHandle)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `rejectedById` | User | SET NULL | no | yes |
  | `userId` | User | CASCADE | yes | no |
  | `verifiedById` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *has profile* (1:1) with User; *links identity* (1:N) with AcademicExternalIdentity; *supports* (1:N) with VerificationEvidence

### AcademicExternalIdentity

- **Table:** `academic_external_identities` (Prisma file `identity.prisma`)
- **Purpose:** External scholarly identity linked to a profile (provider + external id), with link and verification status.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `profileId`, `provider`, `externalId`
- **Other important attributes:** `status`
- **Unique:** (profileId, provider, externalId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `profileId` | AcademicProfile | CASCADE | no | no |

- **Relationships on the diagram:** *links identity* (1:N) with AcademicProfile

### Affiliation

- **Table:** `affiliations` (Prisma file `identity.prisma`)
- **Purpose:** A user's membership of an institution (department, position, student code, current/primary flags) with its verification status.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `institutionId`, `verificationStatus`
- **Other important attributes:** `department`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `institutionId` | Institution | RESTRICT | no | no |
  | `userId` | User | CASCADE | no | no |

- **Relationships on the diagram:** *holds* (1:N) with User; *is affiliated at* (1:N) with Institution

### Institution

- **Table:** `institutions` (Prisma file `identity.prisma`)
- **Purpose:** Registry of universities and organisations (name, slug, ROR id, verification policy).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `name`, `rorId`
- **Other important attributes:** `slug`
- **Unique:** (slug)
- **Foreign keys:** none
- **Relationships on the diagram:** *is affiliated at* (1:N) with Affiliation

### VerificationEvidence

- **Table:** `verification_evidence` (Prisma file `identity.prisma`)
- **Purpose:** Evidence a user submits to verify an academic position or affiliation; an administrator decides it (PENDING -> VERIFIED / NEEDS_MORE_INFORMATION / REJECTED; INVALIDATED when the profile changes).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `verificationType`, `status`
- **Other important attributes:** `academicProfileId`, `revision`
- **Unique:** (userId, submissionKey)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `academicProfileId` | AcademicProfile | CASCADE | no | yes |
  | `institutionId` | Institution | - | no | yes |
  | `previousRequestId` | VerificationEvidence | SET NULL | no | yes |
  | `reviewedById` | User | SET NULL | no | yes |
  | `userId` | User | CASCADE | no | no |

- **Relationships on the diagram:** *submits evidence* (1:N) with User; *supports* (1:N) with AcademicProfile

## D2  Scholarly Corpus

### Paper

- **Table:** `papers` (Prisma file `scholarly.prisma`)
- **Purpose:** Scholarly work in the corpus: identifiers (DOI, OpenAlex), bibliographic metadata, citation counts and quality scores.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `doi`, `title`, `publicationYear`, `journalId`
- **Other important attributes:** `openalexId`, `citationCount`
- **Unique:** (doi); (openalexId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `journalId` | Journal | SET NULL | no | yes |
  | `requestedById` | User | SET NULL | no | yes |
  | `uploadedById` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *writes* (N:M) with Author; *publishes* (1:N) with Journal; *classified under* (N:M) with ResearchTopic; *cites* (N:M) with Report; *analyzes* (N:M) with GapAnalysis; *grounded in* (N:M) with ResearchGap; *collects* (N:M) with Project

### Author

- **Table:** `authors` (Prisma file `scholarly.prisma`)
- **Purpose:** Scholarly author record (OpenAlex id, ORCID, h-index, works and citation counts).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `orcid`, `displayName`, `hIndex`
- **Other important attributes:** `openalexId`
- **Unique:** (openalexId)
- **Foreign keys:** none
- **Relationships on the diagram:** *writes* (N:M) with Paper

### Journal

- **Table:** `journals` (Prisma file `scholarly.prisma`)
- **Purpose:** Publication venue of papers (name, publisher, ISSN, open-access flag).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `name`, `publisher`
- **Other important attributes:** `isOpenAccess`
- **Unique:** (openalexId)
- **Foreign keys:** none
- **Relationships on the diagram:** *publishes* (1:N) with Paper

### ResearchTopic

- **Table:** `research_topics` (Prisma file `scholarly.prisma`)
- **Purpose:** Hierarchical topic taxonomy synced from OpenAlex (level, research field, parent topic).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `topicName`, `level`, `parentTopicId`
- **Other important attributes:** `researchField`
- **Unique:** (level, openalexId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `parentTopicId` | ResearchTopic | SET NULL | no | yes |

- **Relationships on the diagram:** *classified under* (N:M) with Paper; *is parent of* (1:N) with ResearchTopic; *is parent of* (1:N) with ResearchTopic

## D3  Research Analysis (AI)

### Report

- **Table:** `reports` (Prisma file `research.prisma`)
- **Purpose:** Evidence-grounded analytical report generated by AI for a query; charged in credits; status queued -> generating -> ready | failed (refund once on failure).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `query`, `status`, `creditCost`
- **Other important attributes:** `projectId`, `creditTransactionId`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `creditTransactionId` | CreditTransaction | SET NULL | no | yes |
  | `projectId` | Project | SET NULL | no | yes |
  | `userId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *requests report* (1:N) with User; *cites* (N:M) with Paper; *suggests* (1:N) with ResearchGap; *charges report* (1:N) with CreditTransaction; *scopes report* (1:N) with Project; *is submitted as* (1:1) with Submission

### GapAnalysis

- **Table:** `gap_analyses` (Prisma file `research.prisma`)
- **Purpose:** AI research-gap analysis job for a topic; charged in credits; status queued -> analyzing -> ready | failed (refund once on failure).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `topic`, `status`, `creditCost`
- **Other important attributes:** `projectId`, `creditTransactionId`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `creditTransactionId` | CreditTransaction | SET NULL | no | yes |
  | `projectId` | Project | SET NULL | no | yes |
  | `userId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *runs analysis* (1:N) with User; *analyzes* (N:M) with Paper; *produces* (1:N) with ResearchGap; *charges analysis* (1:N) with CreditTransaction; *scopes analysis* (1:N) with Project

### ResearchGap

- **Table:** `research_gaps` (Prisma file `research.prisma`)
- **Purpose:** A research gap produced by an analysis or report, or created by a user; carries validation, assessment and closure status.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `analysisId`, `title`, `gapType`, `validationStatus`
- **Other important attributes:** `sourceReportId`, `userId`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `analysisId` | GapAnalysis | SET NULL | no | yes |
  | `corpusId` | LiteratureCorpus | SET NULL | no | yes |
  | `latestClosureCheckId` | GapClosureCheck | SET NULL | no | yes |
  | `projectId` | Project | SET NULL | no | yes |
  | `sourceReportId` | Report | SET NULL | no | yes |
  | `userId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *produces* (1:N) with GapAnalysis; *suggests* (1:N) with Report; *grounded in* (N:M) with Paper; *receives vote* (1:N) with GapValidation; *discusses gap* (1:N) with ForumPost

### GapValidation

- **Table:** `gap_validations` (Prisma file `research.prisma`)
- **Purpose:** An expert's vote or feedback on a specific version of a research gap (VALIDATE, REJECT, REFINE_SCOPE, CHALLENGE, ...).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `gapId`, `reviewerId`, `action`
- **Other important attributes:** `gapVersion`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `gapId` | ResearchGap | CASCADE | no | no |
  | `reviewerId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *receives vote* (1:N) with ResearchGap; *validates* (1:N) with User

## D4  Projects & Collaboration

### Project

- **Table:** `projects` (Prisma file `collaboration.prisma`)
- **Purpose:** Research project owned by a user; container for members, papers, plan, tasks, mentors, manuscripts and submissions.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `ownerId`, `title`, `status`
- **Other important attributes:** `researchField`, `visibility`
- **Unique:** (createdById, creationKey)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `createdById` | User | SET NULL | no | yes |
  | `ownerId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *owns* (1:N) with User; *is member of* (N:M) with User; *collects* (N:M) with Paper; *scopes report* (1:N) with Report; *scopes analysis* (1:N) with GapAnalysis; *has plan* (1:1) with ResearchPlan; *contains* (1:N) with ProjectTask; *requests mentor* (1:N) with MentorshipRequest; *is mentored in* (1:N) with MentorRelationship; *opens* (1:N) with RecruitmentOpening; *drafts in* (1:N) with DraftWorkspace; *submits* (1:N) with Submission

### ResearchPlan

- **Table:** `research_plans` (Prisma file `collaboration.prisma`)
- **Purpose:** The single research plan of a project (problem, objectives, questions, methodology), versioned.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `projectId`, `problem`, `version`
- **Other important attributes:** `methodology`
- **Unique:** (projectId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `projectId` | Project | CASCADE | yes | no |
  | `updatedById` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *has plan* (1:1) with Project

### ProjectTask

- **Table:** `project_tasks` (Prisma file `project-workspace.prisma`)
- **Purpose:** Task on the project board (status, assignee, milestone, due date, checklist).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `projectId`, `title`, `status`
- **Other important attributes:** `assigneeId`, `dueAt`
- **Unique:** (projectId, createdById, clientKey); (id, projectId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `assigneeId` | User | RESTRICT | no | yes |
  | `completedById` | User | RESTRICT | no | yes |
  | `createdById` | User | RESTRICT | no | no |
  | `milestoneId, projectId` | ProjectMilestone | RESTRICT | no | no |
  | `projectId` | Project | CASCADE | no | no |

- **Relationships on the diagram:** *contains* (1:N) with Project

### MentorshipRequest

- **Table:** `mentorship_requests` (Prisma file `collaboration.prisma`)
- **Purpose:** Request or invitation for a lecturer to mentor a project (direction, mentor role, status, expiry).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `projectId`, `mentorUserId`, `mentorRole`, `status`
- **Other important attributes:** `direction`
- **Unique:** (requestedBy, idempotencyKey); (candidateId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `candidateId` | MentorCandidate | - | yes | yes |
  | `mentorUserId` | User | RESTRICT | no | no |
  | `projectId` | Project | CASCADE | no | no |
  | `requestedBy` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *requests mentor* (1:N) with Project; *is invited as mentor* (1:N) with User; *becomes* (1:1) with MentorRelationship

### MentorRelationship

- **Table:** `mentor_relationships` (Prisma file `collaboration.prisma`)
- **Purpose:** Mentoring relationship created from one accepted mentorship request; active until ended.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `sourceRequestId`, `status`
- **Other important attributes:** `projectId`, `mentorUserId`
- **Unique:** (sourceRequestId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `mentorUserId` | User | RESTRICT | no | no |
  | `projectId` | Project | CASCADE | no | no |
  | `sourceRequestId` | MentorshipRequest | NO ACTION | yes | no |

- **Relationships on the diagram:** *becomes* (1:1) with MentorshipRequest; *is mentored in* (1:N) with Project

### RecruitmentOpening

- **Table:** `recruitment_openings` (Prisma file `collaboration.prisma`)
- **Purpose:** Open position a project publishes to recruit new members (requirements, capacity, closing date).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `projectId`, `title`, `capacity`
- **Other important attributes:** `status`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `createdById` | User | RESTRICT | no | no |
  | `projectId` | Project | CASCADE | no | no |

- **Relationships on the diagram:** *opens* (1:N) with Project; *receives application* (1:N) with RecruitmentApplication

### RecruitmentApplication

- **Table:** `recruitment_applications` (Prisma file `collaboration.prisma`)
- **Purpose:** A user's application to a recruitment opening (one per opening and applicant) and its decision.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `openingId`, `applicantId`, `status`
- **Unique:** (openingId, applicantId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `applicantId` | User | RESTRICT | no | no |
  | `decidedById` | User | SET NULL | no | yes |
  | `openingId` | RecruitmentOpening | CASCADE | no | no |
  | `projectId` | Project | CASCADE | no | no |

- **Relationships on the diagram:** *receives application* (1:N) with RecruitmentOpening; *applies* (1:N) with User

## D5  Manuscript & Peer Review

### DraftWorkspace

- **Table:** `draft_workspaces` (Prisma file `collaboration.prisma`)
- **Purpose:** Collaborative manuscript workspace of a project (writing mode, compiler, document type, main file).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `projectId`, `name`, `writingMode`
- **Other important attributes:** `documentType`
- **Unique:** (projectId, createdById, clientKey)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `createdById` | User | RESTRICT | no | no |
  | `mainFileId` | ManuscriptFile | RESTRICT | no | yes |
  | `projectId` | Project | CASCADE | no | no |

- **Relationships on the diagram:** *drafts in* (1:N) with Project

### Submission

- **Table:** `submissions` (Prisma file `review.prisma`)
- **Purpose:** A manuscript or report artifact submitted by a project for AI pre-review and peer review.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `projectId`, `sourceReportId`, `title`, `status`
- **Other important attributes:** `createdById`
- **Unique:** (sourceReportId)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `createdById` | User | RESTRICT | no | no |
  | `currentRevisionId` | SubmissionRevision | SET NULL | no | yes |
  | `projectId` | Project | RESTRICT | no | no |
  | `sourceReportId` | Report | SET NULL | yes | yes |

- **Relationships on the diagram:** *submits* (1:N) with Project; *is submitted as* (1:1) with Report; *has revision* (1:N) with SubmissionRevision; *is pre-reviewed by* (1:N) with AiPreReview; *requests review* (1:N) with ReviewRequest

### SubmissionRevision

- **Table:** `submission_revisions` (Prisma file `review.prisma`)
- **Purpose:** Numbered revision of a submission (stored file or snapshot, checksum, response to review).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `submissionId`, `revisionNumber`
- **Other important attributes:** `uploadedById`
- **Unique:** (submissionId, revisionNumber)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `attributionCheckId` | ManuscriptAttributionCheck | RESTRICT | no | yes |
  | `manuscriptSnapshotId` | ManuscriptSnapshot | RESTRICT | no | yes |
  | `sourceRevisionId` | SubmissionRevision | RESTRICT | no | yes |
  | `submissionId` | Submission | CASCADE | no | no |
  | `uploadedById` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *has revision* (1:N) with Submission; *is reviewed in* (1:N) with ReviewRequest

### AiPreReview

- **Table:** `ai_pre_reviews` (Prisma file `review.prisma`)
- **Purpose:** AI pre-review of a submission (summary, goal alignment, research-question coverage, citation issues).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `submissionId`, `status`
- **Other important attributes:** `requestedById`, `model`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `requestedById` | User | RESTRICT | no | no |
  | `submissionId` | Submission | CASCADE | no | no |

- **Relationships on the diagram:** *is pre-reviewed by* (1:N) with Submission

### ReviewRequest

- **Table:** `review_requests` (Prisma file `review.prisma`)
- **Purpose:** Request for a reviewer to review one revision of a submission with one template version (REQUESTED -> ACCEPTED -> IN_REVIEW -> COMPLETED / REVISION_REQUESTED ...).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `submissionId`, `status`, `expiresAt`
- **Other important attributes:** `artifactRevisionId`, `templateVersionId`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `artifactRevisionId` | SubmissionRevision | RESTRICT | no | no |
  | `projectId` | Project | CASCADE | no | no |
  | `requesterId` | User | RESTRICT | no | no |
  | `submissionId` | Submission | CASCADE | no | no |
  | `templateVersionId` | ReviewTemplateVersion | RESTRICT | no | no |

- **Relationships on the diagram:** *requests review* (1:N) with Submission; *is reviewed in* (1:N) with SubmissionRevision; *assigns* (1:1) with ReviewerAssignment; *is used by* (1:N) with ReviewTemplateVersion

### ReviewerAssignment

- **Table:** `reviewer_assignments` (Prisma file `review.prisma`)
- **Purpose:** The reviewer's assignment for a review request (anonymous code, status, due date, conflict checks).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `reviewRequestId`, `reviewerId`, `status`
- **Other important attributes:** `anonymousCode`
- **Unique:** (reviewRequestId); (anonymousCode)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `artifactRevisionId` | SubmissionRevision | RESTRICT | no | yes |
  | `assignedById` | User | RESTRICT | no | no |
  | `reviewRequestId` | ReviewRequest | CASCADE | yes | yes |
  | `reviewerId` | User | RESTRICT | no | no |
  | `submissionId` | Submission | CASCADE | no | no |

- **Relationships on the diagram:** *assigns* (1:1) with ReviewRequest; *reviews as* (1:N) with User; *produces round* (1:N) with HumanReview

### HumanReview

- **Table:** `human_reviews` (Prisma file `review.prisma`)
- **Purpose:** One review round written by the assigned reviewer (comments, recommendation, weighted score).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `assignmentId`, `roundNumber`, `recommendation`
- **Other important attributes:** `weightedScore`
- **Unique:** (assignmentId, roundNumber)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `assignmentId` | ReviewerAssignment | CASCADE | no | no |
  | `reviewerId` | User | RESTRICT | no | no |
  | `revisionId` | SubmissionRevision | RESTRICT | no | no |
  | `submissionId` | Submission | CASCADE | no | no |
  | `templateId` | ReviewTemplate | SET NULL | no | yes |
  | `templateVersionId` | ReviewTemplateVersion | RESTRICT | no | yes |

- **Relationships on the diagram:** *produces round* (1:N) with ReviewerAssignment

### ReviewTemplate

- **Table:** `review_templates` (Prisma file `review.prisma`)
- **Purpose:** Review rubric owned by a user or project.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `name`, `status`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `activeVersionId` | ReviewTemplateVersion | SET NULL | no | yes |
  | `ownerId` | User | SET NULL | no | yes |
  | `projectId` | Project | CASCADE | no | yes |

- **Relationships on the diagram:** *has version* (1:N) with ReviewTemplateVersion

### ReviewTemplateVersion

- **Table:** `review_template_versions` (Prisma file `review.prisma`)
- **Purpose:** A published version of a review template (version number, review mode, guidelines).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `templateId`, `versionNumber`
- **Other important attributes:** `reviewMode`
- **Unique:** (templateId, versionNumber)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `createdById` | User | SET NULL | no | yes |
  | `templateId` | ReviewTemplate | CASCADE | no | no |

- **Relationships on the diagram:** *has version* (1:N) with ReviewTemplate; *is used by* (1:N) with ReviewRequest

## D6  Community & Forum

### Community

- **Table:** `communities` (Prisma file `collaboration.prisma`)
- **Purpose:** Forum community or category (visibility, status, rules, owner).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `name`, `visibility`, `status`
- **Other important attributes:** `ownerId`, `slug`
- **Unique:** (slug)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `ownerId` | User | RESTRICT | no | no |
  | `reviewedById` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *joins* (N:M) with User; *hosts* (1:N) with ForumPost

### ForumPost

- **Table:** `forum_posts` (Prisma file `collaboration.prisma`)
- **Purpose:** Forum thread in a community; can link a paper, a project or a research gap.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `authorId`, `communityId`, `title`, `status`
- **Other important attributes:** `linkedResearchGapId`, `type`
- **Unique:** (publicSlug)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `acceptedCommentId` | ForumComment | SET NULL | no | yes |
  | `authorId` | User | RESTRICT | no | no |
  | `communityId` | Community | SET NULL | no | yes |
  | `linkedPaperId` | Paper | SET NULL | no | yes |
  | `linkedProjectId` | Project | SET NULL | no | yes |
  | `linkedResearchGapId` | ResearchGap | SET NULL | no | yes |
  | `researchCommunityId` | Community | RESTRICT | no | yes |
  | `researchGapId` | ResearchGap | SET NULL | no | yes |

- **Relationships on the diagram:** *hosts* (1:N) with Community; *authors post* (1:N) with User; *has comment* (1:N) with ForumComment; *is reported in* (1:N) with ContentReport; *discusses gap* (1:N) with ResearchGap

### ForumComment

- **Table:** `forum_comments` (Prisma file `collaboration.prisma`)
- **Purpose:** Comment on a post; replies are threaded through parentCommentId.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `postId`, `parentCommentId`, `status`
- **Other important attributes:** `authorId`
- **Unique:** (postId, postNumber)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `authorId` | User | RESTRICT | no | no |
  | `parentCommentId` | ForumComment | SET NULL | no | yes |
  | `postId` | ForumPost | CASCADE | no | no |

- **Relationships on the diagram:** *has comment* (1:N) with ForumPost; *replies to* (1:N) with ForumComment; *replies to* (1:N) with ForumComment; *writes comment* (1:N) with User; *flags comment* (1:N) with ContentReport

### ContentReport

- **Table:** `forum_content_reports` (Prisma file `collaboration.prisma`)
- **Purpose:** A user's report of a post or comment for moderation (reason, status, reviewer).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `reporterId`, `reason`, `status`
- **Other important attributes:** `postId`, `commentId`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `commentId` | ForumComment | CASCADE | no | yes |
  | `communityId` | Community | SET NULL | no | yes |
  | `postId` | ForumPost | CASCADE | no | yes |
  | `reporterId` | User | RESTRICT | no | no |
  | `researchCommunityId` | Community | SET NULL | no | yes |
  | `reviewedById` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *is reported in* (1:N) with ForumPost; *flags comment* (1:N) with ForumComment; *files report* (1:N) with User

## D7  Credits & Payments

### CreditTransaction

- **Table:** `credit_transactions` (Prisma file `operations.prisma`)
- **Purpose:** Credit ledger row (type charge / refund / reward) with the balance after it and a unique idempotency key; a refund row points to the charge it refunds.
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `action`, `amount`, `idempotencyKey`, `refundedTransactionId`
- **Other important attributes:** `type`, `balanceAfter`, `status`
- **Unique:** (idempotencyKey)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `refundedTransactionId` | CreditTransaction | SET NULL | no | yes |
  | `userId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *has ledger entry* (1:N) with User; *refunds* (1:N) with CreditTransaction; *refunds* (1:N) with CreditTransaction; *charges report* (1:N) with Report; *charges analysis* (1:N) with GapAnalysis

### PaymentOrder

- **Table:** `payment_orders` (Prisma file `operations.prisma`)
- **Purpose:** PayOS credit top-up order (order code, amount in VND, credits, status pending -> paid).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `orderCode`, `amount`, `status`
- **Other important attributes:** `credits`
- **Unique:** (orderCode)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `userId` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *places order* (1:N) with User

## D8  Notifications & System Operations

### Notification

- **Table:** `notifications` (Prisma file `operations.prisma`)
- **Purpose:** In-app / e-mail notification for one user (or for a role when userId is empty).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `type`, `isRead`
- **Other important attributes:** `title`
- **Unique:** (eventKey)
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `paperId` | Paper | SET NULL | no | yes |
  | `userId` | User | CASCADE | no | yes |

- **Relationships on the diagram:** *receives* (1:N) with User

### AuditLog

- **Table:** `audit_logs` (Prisma file `operations.prisma`)
- **Purpose:** Record of an administrative or security-relevant action (action name, target table and record).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `actionName`
- **Other important attributes:** `targetTableName`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `userId` | User | SET NULL | no | yes |

- **Relationships on the diagram:** *performs* (1:N) with User

### UserAiConnection

- **Table:** `user_ai_connections` (Prisma file `user-ai.prisma`)
- **Purpose:** A user's own AI provider connection (provider, base URL, model, encrypted API key).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `userId`, `provider`
- **Other important attributes:** `model`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `userId` | User | CASCADE | no | no |

- **Relationships on the diagram:** *configures* (1:N) with User

## Join tables drawn as N:M relationships

| Join table | Realises | Attributes on the diamond |
|---|---|---|
| `paper_authors` (PaperAuthor) | Author N:M Paper (writes). PK (paperId, position); authorId is nullable, so an author slot may hold only a display name. | position, isCorresponding |
| `paper_topics` (PaperTopic) | Paper N:M ResearchTopic (classified under). PK (paperId, position); topicId is nullable. | confidence, isPrimary |
| `report_papers` (ReportPaper) | Report N:M Paper (cites). PK (reportId, paperId, kind). | kind, position |
| `gap_analysis_papers` (GapAnalysisPaper) | GapAnalysis N:M Paper (analyzes). PK (analysisId, paperId). | position |
| `research_gap_papers` (ResearchGapPaper) | ResearchGap N:M Paper (grounded in). PK (gapId, paperId, kind). | kind |
| `project_members` (ProjectMember) | User N:M Project (is member of). Own id; UNIQUE (projectId, userId). | role, status |
| `project_papers` (ProjectPaper) | Project N:M Paper (collects). Own id; UNIQUE (projectId, paperId). | screeningStatus, readingStatus |
| `community_memberships` (CommunityMembership) | User N:M Community (joins). Own id; UNIQUE (communityId, userId). | role, status |

## Relationship list

| # | Relationship | Cardinality | Entities | Evidence (FK / constraint) | Note |
|---|---|---|---|---|---|
| 1 | has profile | 1:1 | User (1) - AcademicProfile (1) | `AcademicProfile.userId (UNIQUE)` |  |
| 2 | links identity | 1:N | AcademicProfile (1) - AcademicExternalIdentity (N) | `AcademicExternalIdentity.profileId` |  |
| 3 | holds | 1:N | User (1) - Affiliation (N) | `Affiliation.userId` |  |
| 4 | is affiliated at | 1:N | Institution (1) - Affiliation (N) | `Affiliation.institutionId` |  |
| 5 | submits evidence | 1:N | User (1) - VerificationEvidence (N) | `VerificationEvidence.userId` |  |
| 6 | supports | 1:N | AcademicProfile (1) - VerificationEvidence (N) | `VerificationEvidence.academicProfileId` |  |
| 7 | writes | N:M | Author (N) - Paper (M) | `PaperAuthor.paperId, PaperAuthor.authorId` |  |
| 8 | publishes | 1:N | Journal (1) - Paper (N) | `Paper.journalId` |  |
| 9 | classified under | N:M | Paper (N) - ResearchTopic (M) | `PaperTopic.paperId, PaperTopic.topicId` |  |
| 10 | is parent of | 1:N | ResearchTopic (1) - ResearchTopic (N) | `ResearchTopic.parentTopicId` |  |
| 11 | requests report | 1:N | User (1) - Report (N) | `Report.userId` |  |
| 12 | cites | N:M | Report (N) - Paper (M) | `ReportPaper.reportId, ReportPaper.paperId` |  |
| 13 | runs analysis | 1:N | User (1) - GapAnalysis (N) | `GapAnalysis.userId` |  |
| 14 | analyzes | N:M | GapAnalysis (N) - Paper (M) | `GapAnalysisPaper.analysisId, GapAnalysisPaper.paperId` |  |
| 15 | produces | 1:N | GapAnalysis (1) - ResearchGap (N) | `ResearchGap.analysisId` |  |
| 16 | suggests | 1:N | Report (1) - ResearchGap (N) | `ResearchGap.sourceReportId` |  |
| 17 | grounded in | N:M | ResearchGap (N) - Paper (M) | `ResearchGapPaper.gapId, ResearchGapPaper.paperId` |  |
| 18 | receives vote | 1:N | ResearchGap (1) - GapValidation (N) | `GapValidation.gapId` |  |
| 19 | validates | 1:N | User (1) - GapValidation (N) | `GapValidation.reviewerId` |  |
| 20 | has ledger entry | 1:N | User (1) - CreditTransaction (N) | `CreditTransaction.userId` |  |
| 21 | refunds | 1:N | CreditTransaction (1) - CreditTransaction (N) | `CreditTransaction.refundedTransactionId` | refundCreditsOnce writes at most one refund per charge (idempotency key refund:<chargeId> is UNIQUE); the FK column itself is not UNIQUE, so the diagram shows the database cardinality 1:N. |
| 22 | charges report | 1:N | CreditTransaction (1) - Report (N) | `Report.creditTransactionId` | A charge belongs to one report by business rule, but reports.credit_transaction_id has no UNIQUE constraint, so the database allows 1:N. |
| 23 | charges analysis | 1:N | CreditTransaction (1) - GapAnalysis (N) | `GapAnalysis.creditTransactionId` | Same as 'charges report' for gap analyses. |
| 24 | places order | 1:N | User (1) - PaymentOrder (N) | `PaymentOrder.userId` |  |
| 25 | receives | 1:N | User (1) - Notification (N) | `Notification.userId` |  |
| 26 | performs | 1:N | User (1) - AuditLog (N) | `AuditLog.userId` |  |
| 27 | configures | 1:N | User (1) - UserAiConnection (N) | `UserAiConnection.userId` |  |
| 28 | owns | 1:N | User (1) - Project (N) | `Project.ownerId` |  |
| 29 | is member of | N:M | User (N) - Project (M) | `ProjectMember.userId, ProjectMember.projectId (UNIQUE pair)` |  |
| 30 | collects | N:M | Project (N) - Paper (M) | `ProjectPaper.projectId, ProjectPaper.paperId (UNIQUE pair)` |  |
| 31 | scopes report | 1:N | Project (1) - Report (N) | `Report.projectId` |  |
| 32 | scopes analysis | 1:N | Project (1) - GapAnalysis (N) | `GapAnalysis.projectId` |  |
| 33 | has plan | 1:1 | Project (1) - ResearchPlan (1) | `ResearchPlan.projectId (UNIQUE)` |  |
| 34 | contains | 1:N | Project (1) - ProjectTask (N) | `ProjectTask.projectId` |  |
| 35 | requests mentor | 1:N | Project (1) - MentorshipRequest (N) | `MentorshipRequest.projectId` |  |
| 36 | is invited as mentor | 1:N | User (1) - MentorshipRequest (N) | `MentorshipRequest.mentorUserId` |  |
| 37 | becomes | 1:1 | MentorshipRequest (1) - MentorRelationship (1) | `MentorRelationship.sourceRequestId (UNIQUE)` |  |
| 38 | is mentored in | 1:N | Project (1) - MentorRelationship (N) | `MentorRelationship.projectId` |  |
| 39 | opens | 1:N | Project (1) - RecruitmentOpening (N) | `RecruitmentOpening.projectId` |  |
| 40 | receives application | 1:N | RecruitmentOpening (1) - RecruitmentApplication (N) | `RecruitmentApplication.openingId` |  |
| 41 | applies | 1:N | User (1) - RecruitmentApplication (N) | `RecruitmentApplication.applicantId` |  |
| 42 | drafts in | 1:N | Project (1) - DraftWorkspace (N) | `DraftWorkspace.projectId` |  |
| 43 | submits | 1:N | Project (1) - Submission (N) | `Submission.projectId` |  |
| 44 | is submitted as | 1:1 | Report (1) - Submission (1) | `Submission.sourceReportId (UNIQUE)` |  |
| 45 | has revision | 1:N | Submission (1) - SubmissionRevision (N) | `SubmissionRevision.submissionId` |  |
| 46 | is pre-reviewed by | 1:N | Submission (1) - AiPreReview (N) | `AiPreReview.submissionId` |  |
| 47 | requests review | 1:N | Submission (1) - ReviewRequest (N) | `ReviewRequest.submissionId` |  |
| 48 | is reviewed in | 1:N | SubmissionRevision (1) - ReviewRequest (N) | `ReviewRequest.artifactRevisionId` |  |
| 49 | assigns | 1:1 | ReviewRequest (1) - ReviewerAssignment (1) | `ReviewerAssignment.reviewRequestId (UNIQUE)` |  |
| 50 | reviews as | 1:N | User (1) - ReviewerAssignment (N) | `ReviewerAssignment.reviewerId` |  |
| 51 | produces round | 1:N | ReviewerAssignment (1) - HumanReview (N) | `HumanReview.assignmentId` |  |
| 52 | has version | 1:N | ReviewTemplate (1) - ReviewTemplateVersion (N) | `ReviewTemplateVersion.templateId` |  |
| 53 | is used by | 1:N | ReviewTemplateVersion (1) - ReviewRequest (N) | `ReviewRequest.templateVersionId` |  |
| 54 | joins | N:M | User (N) - Community (M) | `CommunityMembership.userId, CommunityMembership.communityId (UNIQUE pair)` |  |
| 55 | hosts | 1:N | Community (1) - ForumPost (N) | `ForumPost.communityId` |  |
| 56 | authors post | 1:N | User (1) - ForumPost (N) | `ForumPost.authorId` |  |
| 57 | has comment | 1:N | ForumPost (1) - ForumComment (N) | `ForumComment.postId` |  |
| 58 | replies to | 1:N | ForumComment (1) - ForumComment (N) | `ForumComment.parentCommentId` |  |
| 59 | writes comment | 1:N | User (1) - ForumComment (N) | `ForumComment.authorId` |  |
| 60 | is reported in | 1:N | ForumPost (1) - ContentReport (N) | `ContentReport.postId` |  |
| 61 | flags comment | 1:N | ForumComment (1) - ContentReport (N) | `ContentReport.commentId` |  |
| 62 | files report | 1:N | User (1) - ContentReport (N) | `ContentReport.reporterId` |  |
| 63 | discusses gap | 1:N | ResearchGap (1) - ForumPost (N) | `ForumPost.linkedResearchGapId` |  |

## Models not drawn on the overview (190 of 237)

The overview shows the core entity of each business flow. The models below are implemented, but they are detail, history, audit or infrastructure tables. Report 4 (Physical ERD) covers them per module.

| Prisma file | Models |
|---|---|
| `collaboration.prisma` | CopyrightClaim, DraftWorkspaceMember, ForumCommentRevision, ForumModerationAction, ForumPostDailyView, ForumPostGap, ForumPostPaper, ForumPostProject, ForumPostRevision, ForumPostTag, ForumPostView, ForumReaction, ForumReference, ForumRestriction, ForumTag, ForumThreadFollow, ForumVote, MentorCandidate, MentorInvitationPlan, MentorSuggestion, ModerationAppeal, ProjectActivity, ProjectChatCitation, ProjectChatMessage, ProjectContributionHistory, ProjectContributionProposal, ProjectInvitation, ProjectTeamMessage, ProjectTeamMessageRead, SectionRevision, UserTopicFollow, UserTopicMute, WorkspaceComment, WorkspaceSection |
| `contribution-evaluation.prisma` | ContributionEvaluationDecision, ContributionEvaluationRule, ContributionEvaluationRun, ContributionEvaluationSnapshot, ContributionEvaluationState, ContributionOutcome, ContributionOutcomeEvaluation, ContributionOutcomeSource |
| `github.prisma` | GithubConnection |
| `identity.prisma` | AcademicEmailVerificationChallenge, AcademicFeaturedWork, AcademicIdentityLink, AcademicProfileHandle, AcademicProgram, AcademicVerificationEvidence, Campus, EmailVerificationToken, InstitutionDomain, OAuthAccount, PasswordResetToken, RefreshToken, UserCapability, UserDisplayNameChange, UserEmail, VerificationEvidenceDeletion, VerificationEvidenceSource, VerificationEvidenceUpload |
| `knowledge.prisma` | KnowledgeEntity, KnowledgeRelation, PaperChunk, PaperDocument |
| `manuscript.prisma` | ManuscriptAttributionCheck, ManuscriptAttributionDecision, ManuscriptCompilation, ManuscriptFile, ManuscriptRemoteBinding, ManuscriptSnapshot, ManuscriptSnapshotAsset, ManuscriptSuggestion, ManuscriptUpdate, ManuscriptWritingReport |
| `mentor-access.prisma` | MentorAccess, MentorAccessEvent, MentorAgreement, MentorFeedback, MentorResourceShare |
| `mentorship-content.prisma` | MentorshipAttachment, MentorshipDraft, MentorshipRequestAttachment |
| `migration.prisma` | DataMigrationCheckpoint, DataMigrationFailure, DataMigrationIdMap, DataMigrationRun |
| `operations.prisma` | ApiProvider, ApiSyncConfig, ApiSyncRun, CorpusValidationRun, DeviceToken, IngestDeadLetter, McpToolRun, NotificationRead, OpenAlexIngestCampaign, OpenAlexIngestPageAttempt, OpenAlexIngestPartition, OpenAlexRefreshWatermark, PaperCohortMembership, ProjectTrendSnapshot, SearchLog, TopicBackfillRun, TrendExplanation, TrendTopicFollow |
| `project-allocation.prisma` | AllocationApproval, AllocationPeriod, AllocationRevision, AllocationShare, ContributionParticipant, ContributionReview, ProjectMembershipPeriod, ResearchEvidenceEvent, ResearchIntegrityCase, ResearchIntegrityEvent |
| `project-research.prisma` | ProjectEvidenceItem, ProjectFeasibilityAssessment, ProjectLimitation, ProjectLimitationSource, ProjectMatrixCriterion, ProjectPaperFile, ProjectScreeningDecision |
| `project-screening.prisma` | ScreeningAdjudicationCase, ScreeningAdjudicationConflict, ScreeningAdjudicationInvitation, ScreeningAdjudicationStatement, ScreeningAiSuggestion, ScreeningAssignment, ScreeningAudit, ScreeningFinalDecision, ScreeningLegacyRecord, ScreeningReview, ScreeningRound, ScreeningSettings |
| `project-workspace.prisma` | PlanRevision, PlanShare, ProjectDecision, ProjectDiscussion, ProjectMilestone, ProjectWorkspaceComment, ProjectWorkspaceRevision |
| `research.prisma` | Bookmark, CalibrationQuestion, ClosureCalibration, CorpusPaper, CoverageCheck, CoverageCheckItem, GapClosureCheck, GapClosureDocument, GapDirectionItem, GapDirectionPaper, GapDirections, GapEvidenceRecord, LiteratureCorpus, QualityEvaluation, QualityProjectAssessment, RagQuery, RagQueryResult, UserRating |
| `review.prisma` | AiRun, AiRunEvidence, ExternalReviewInvitation, ResearchContribution, ReviewConflict, ReviewCriterion, ReviewCriterionLevel, ReviewResponse, ReviewRevisionItem, ReviewRevisionResponse, SubmissionAuthor, SubmissionDeclaredConflict |
| `scholarly.prisma` | AuthorAffiliation, JournalIssn, Keyword, PaperDownload, PaperFormatCheck, PaperIdentity, PaperKeyword, PaperQualityCheck, PaperReview, PaperSourceRecord, PaperTag, PaperTranslation, Tag, TagRule |
| `screening-obligation.prisma` | ScreeningObligation, ScreeningObligationEvent |
| `user-ai.prisma` | PlatformAiConnection, PlatformEmbeddingConnection, UserAiPreference |

## Points to verify / not implemented

- **Audit FKs are not drawn as lines.** Columns such as `reviewedById`, `decidedById`, `verifiedById`, `assignedById` and `uploadedById` reference User. They are listed in the FK tables above, but drawn lines are limited to the owning or acting user of each record, to keep the overview readable.
- **Journal** is read by `papers/paper.service.ts`, but no service in `apps/backend/src` writes it. Its rows come from the legacy data migration or from ingestion outside the API, so the write path needs verification.
- **Payment and ledger link.** PaymentOrder has no FK to CreditTransaction. A paid order is linked to its reward ledger row only by the idempotency key `payos:<orderCode>`, so the diagram draws no relationship between them.
- **Dead status values** (allowed by CHECK constraints but never written by code): ReviewRequest `SUBMITTED`; Submission `accepted`, `rejected`, `withdrawn`; PaymentOrder `cancelled`, `expired`; VerificationEvidence `UNVERIFIED`, `NOT_SUBMITTED`, `EXPIRED`. These do not change the ERD.
- **Proposed, not built (BM04 RF-31 / RF-32):** a lecturer's field mapped to the OpenAlex taxonomy, and credibility evidence shown on the directory. ResearchTopic already exists, but no table links a lecturer to topics for this purpose yet, so nothing is drawn.
