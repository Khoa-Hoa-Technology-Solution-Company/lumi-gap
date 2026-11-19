# Entity Dictionary - Overall Logical ERD (LumiGap)

Companion to `OVERALL_LOGICAL_ERD.drawio` (Chen notation, version 1.2).

**Source of truth.** Entities, attributes and keys come from the Prisma schema in `apps/backend/prisma/*.prisma`. Foreign keys and UNIQUE constraints were replayed from the 153 SQL migrations in `apps/backend/prisma/migrations` on `main` ca5280c. Most relations are declared only in SQL, not in Prisma. Each entity was also checked for read/write use in `apps/backend/src` services.

**Cardinality rule.** An FK without a UNIQUE constraint gives 1:N. An FK covered by a UNIQUE constraint gives 1:1. A join table with two FKs gives N:M, drawn as one relationship diamond that carries the join table's attributes.

**Status legend.** Every entity in the diagram is *Implemented*: the table exists in the migrations and backend services read or write it. Items that are only *Documented* or *Proposed* are listed at the end and are not drawn.

**Participation.** A double line joins an entity to a relationship when every instance of that entity must take part, meaning the FK column it holds is NOT NULL. A single line means partial participation: the FK is nullable, or the entity is the referenced (parent) side. The schema cannot force a parent to have children, so parent sides are always partial. Both sides of an N:M relationship are partial for the same reason.

**Weak entities.** An entity is drawn as weak (double rectangle) only when it has no key of its own and its primary key is the owner's key plus a partial key (dashed underline), joined to the owner by an identifying relationship (double diamond). The 39 strong entities all have their own UUID `id`. Some of them depend on another record in business terms (for example SubmissionRevision, ReviewTemplateVersion, HumanReview), but they still have their own key, so they are strong. Only `paper_authors` and `paper_topics` meet the rule: PK (paperId, position), with no own id. Version 1.0 drew them as N:M relationships. That was not correct, because authorId and topicId are nullable, so a row can exist without the second participant. Version 1.1 draws them as weak entities of Paper. They are the same two tables, so the scope is unchanged.

**Version 1.2 (baseline refresh).** Re-checked against `main` ca5280c. The newer code adds 6 models (ManuscriptAiAcceptance, ManuscriptIntegrityAcknowledgement, ManuscriptIntegrityRecord, MentorshipApplication, MentorshipApplicationEvent, MentorshipApplicationNote) and 20 FKs. None of the 41 drawn entities lost a field, key or FK, so every drawn element is still valid and the drawing itself is unchanged. Two drawn entities gained nullable FKs to new models outside the overview: `MentorshipRequest.applicationId` to MentorshipApplication and `SubmissionRevision.integrityReportId` to ManuscriptIntegrityRecord. They are listed under category F below. The new models are not added, to keep the 41-entity scope.

## Summary

| Domain | Entities |
|---|---|
| D1  Identity & Academic Verification | User, AcademicProfile, AcademicExternalIdentity, Affiliation, Institution, VerificationEvidence (6) |
| D2  Scholarly Corpus | Paper, Author, Journal, ResearchTopic, PaperAuthor (weak), PaperTopic (weak) (6) |
| D3  Research Analysis (AI) | Report, GapAnalysis, ResearchGap, GapValidation (4) |
| D4  Projects & Collaboration | Project, ResearchPlan, ProjectTask, MentorshipRequest, MentorRelationship, RecruitmentOpening, RecruitmentApplication (7) |
| D5  Manuscript & Peer Review | DraftWorkspace, Submission, SubmissionRevision, AiPreReview, ReviewRequest, ReviewerAssignment, HumanReview, ReviewTemplate, ReviewTemplateVersion (9) |
| D6  Community & Forum | Community, ForumPost, ForumComment, ContentReport (4) |
| D7  Credits & Payments | CreditTransaction, PaymentOrder (2) |
| D8  Notifications & System Operations | Notification, AuditLog, UserAiConnection (3) |

Totals: **39 strong + 2 weak entities**, **75 relationships** (5 x 1:1, 64 x 1:N, 6 x N:M; 2 identifying), **8 domains**.

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
- **Relationships on the diagram:** *is affiliated at* (1:N) with Affiliation; *concerns institution* (1:N) with VerificationEvidence

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

- **Relationships on the diagram:** *submits evidence* (1:N) with User; *supports* (1:N) with AcademicProfile; *concerns institution* (1:N) with Institution; *resubmits* (1:N) with VerificationEvidence; *resubmits* (1:N) with VerificationEvidence

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

- **Relationships on the diagram:** *lists author* (1:N) with PaperAuthor; *publishes* (1:N) with Journal; *has topic* (1:N) with PaperTopic; *cites* (N:M) with Report; *analyzes* (N:M) with GapAnalysis; *grounded in* (N:M) with ResearchGap; *collects* (N:M) with Project; *references paper* (1:N) with ForumPost

### Author

- **Table:** `authors` (Prisma file `scholarly.prisma`)
- **Purpose:** Scholarly author record (OpenAlex id, ORCID, h-index, works and citation counts).
- **Primary key:** `id` (UUID)
- **Attributes on the diagram:** `id`, `orcid`, `displayName`, `hIndex`
- **Other important attributes:** `openalexId`
- **Unique:** (openalexId)
- **Foreign keys:** none
- **Relationships on the diagram:** *is credited as* (1:N) with PaperAuthor

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

- **Relationships on the diagram:** *classifies* (1:N) with PaperTopic; *is parent of* (1:N) with ResearchTopic; *is parent of* (1:N) with ResearchTopic

### PaperAuthor

- **Table:** `paper_authors` (Prisma file `scholarly.prisma`)
- **Purpose:** Weak entity: one author slot of a paper (position, display name, corresponding flag). It is identified by its paper plus position; the link to an Author record is optional, so a slot may carry only a display name.
- **Primary key:** (`paperId`, `position`): owner key `paperId` (identifying relationship to Paper) + partial key `position`
- **Attributes on the diagram:** `position`, `displayName`, `isCorresponding`, `authorId`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `authorId` | Author | SET NULL | no | yes |
  | `paperId` | Paper | CASCADE | no | no |

- **Relationships on the diagram:** *lists author* (1:N) with Paper; *is credited as* (1:N) with Author

### PaperTopic

- **Table:** `paper_topics` (Prisma file `scholarly.prisma`)
- **Purpose:** Weak entity: one topic slot of a paper (position, topic name, confidence, primary flag, OpenAlex field/subfield/domain names). It is identified by its paper plus position; the link to ResearchTopic is optional.
- **Primary key:** (`paperId`, `position`): owner key `paperId` (identifying relationship to Paper) + partial key `position`
- **Attributes on the diagram:** `position`, `topicName`, `confidence`, `topicId`
- **Other important attributes:** `isPrimary`
- **Foreign keys (all, from the migrations):**

  | FK column | References | On delete | Unique | Nullable |
  |---|---|---|---|---|
  | `paperId` | Paper | CASCADE | no | no |
  | `topicId` | ResearchTopic | SET NULL | no | yes |

- **Relationships on the diagram:** *has topic* (1:N) with Paper; *classifies* (1:N) with ResearchTopic

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

- **Relationships on the diagram:** *produces* (1:N) with GapAnalysis; *suggests* (1:N) with Report; *grounded in* (N:M) with Paper; *receives vote* (1:N) with GapValidation; *discusses gap* (1:N) with ForumPost; *scopes gap* (1:N) with Project

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

- **Relationships on the diagram:** *owns* (1:N) with User; *is member of* (N:M) with User; *collects* (N:M) with Paper; *scopes report* (1:N) with Report; *scopes analysis* (1:N) with GapAnalysis; *has plan* (1:1) with ResearchPlan; *contains* (1:N) with ProjectTask; *requests mentor* (1:N) with MentorshipRequest; *is mentored in* (1:N) with MentorRelationship; *opens* (1:N) with RecruitmentOpening; *drafts in* (1:N) with DraftWorkspace; *submits* (1:N) with Submission; *showcases project* (1:N) with ForumPost; *defines rubric* (1:N) with ReviewTemplate; *scopes gap* (1:N) with ResearchGap

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
  | `milestoneId, projectId` | ProjectMilestone | RESTRICT | no | yes |
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
  | `applicationId, projectId, mentorUserId` | MentorshipApplication | - | no | yes |
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
- **Unique:** (projectId, createdById, clientKey); (id, projectId)
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

- **Relationships on the diagram:** *submits* (1:N) with Project; *is submitted as* (1:1) with Report; *has revision* (1:N) with SubmissionRevision; *is pre-reviewed by* (1:N) with AiPreReview; *requests review* (1:N) with ReviewRequest; *is current revision of* (1:N) with SubmissionRevision

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
  | `integrityReportId` | ManuscriptIntegrityRecord | - | no | yes |
  | `integrityReportId, manuscriptSnapshotId` | ManuscriptIntegrityRecord | - | no | yes |
  | `manuscriptSnapshotId` | ManuscriptSnapshot | RESTRICT | no | yes |
  | `sourceRevisionId` | SubmissionRevision | RESTRICT | no | yes |
  | `submissionId` | Submission | CASCADE | no | no |
  | `uploadedById` | User | RESTRICT | no | no |

- **Relationships on the diagram:** *has revision* (1:N) with Submission; *is reviewed in* (1:N) with ReviewRequest; *assesses revision* (1:N) with HumanReview; *is current revision of* (1:N) with Submission

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

- **Relationships on the diagram:** *produces round* (1:N) with ReviewerAssignment; *assesses revision* (1:N) with SubmissionRevision; *follows rubric* (1:N) with ReviewTemplateVersion

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

- **Relationships on the diagram:** *has version* (1:N) with ReviewTemplateVersion; *defines rubric* (1:N) with Project

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

- **Relationships on the diagram:** *has version* (1:N) with ReviewTemplate; *is used by* (1:N) with ReviewRequest; *follows rubric* (1:N) with HumanReview

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

- **Relationships on the diagram:** *hosts* (1:N) with Community; *authors post* (1:N) with User; *has comment* (1:N) with ForumComment; *is reported in* (1:N) with ContentReport; *discusses gap* (1:N) with ResearchGap; *references paper* (1:N) with Paper; *showcases project* (1:N) with Project; *accepts answer* (1:N) with ForumComment

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

- **Relationships on the diagram:** *has comment* (1:N) with ForumPost; *replies to* (1:N) with ForumComment; *replies to* (1:N) with ForumComment; *writes comment* (1:N) with User; *flags comment* (1:N) with ContentReport; *accepts answer* (1:N) with ForumPost

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
| `report_papers` (ReportPaper) | Report N:M Paper (cites). PK (reportId, paperId, kind). | kind, position |
| `gap_analysis_papers` (GapAnalysisPaper) | GapAnalysis N:M Paper (analyzes). PK (analysisId, paperId). | position |
| `research_gap_papers` (ResearchGapPaper) | ResearchGap N:M Paper (grounded in). PK (gapId, paperId, kind). | kind |
| `project_members` (ProjectMember) | User N:M Project (is member of). Own id; UNIQUE (projectId, userId). | role, status |
| `project_papers` (ProjectPaper) | Project N:M Paper (collects). Own id; UNIQUE (projectId, paperId). | screeningStatus, readingStatus |
| `community_memberships` (CommunityMembership) | User N:M Community (joins). Own id; UNIQUE (communityId, userId). | role, status |

## Relationship list

| # | Relationship | Cardinality | Entities (participation) | Evidence (FK / constraint) | Note |
|---|---|---|---|---|---|
| 1 | has profile | 1:1 | User (1, partial) - AcademicProfile (1, total) | `AcademicProfile.userId (UNIQUE)` |  |
| 2 | links identity | 1:N | AcademicProfile (1, partial) - AcademicExternalIdentity (N, total) | `AcademicExternalIdentity.profileId` |  |
| 3 | holds | 1:N | User (1, partial) - Affiliation (N, total) | `Affiliation.userId` |  |
| 4 | is affiliated at | 1:N | Institution (1, partial) - Affiliation (N, total) | `Affiliation.institutionId` |  |
| 5 | submits evidence | 1:N | User (1, partial) - VerificationEvidence (N, total) | `VerificationEvidence.userId` |  |
| 6 | supports | 1:N | AcademicProfile (1, partial) - VerificationEvidence (N, partial) | `VerificationEvidence.academicProfileId` |  |
| 7 | lists author (identifying) | 1:N | Paper (1, partial) - PaperAuthor (N, total) | `PaperAuthor.paperId (part of PK)` | Identifying relationship of the weak entity PaperAuthor. |
| 8 | is credited as | 1:N | Author (1, partial) - PaperAuthor (N, partial) | `PaperAuthor.authorId` |  |
| 9 | publishes | 1:N | Journal (1, partial) - Paper (N, partial) | `Paper.journalId` |  |
| 10 | has topic (identifying) | 1:N | Paper (1, partial) - PaperTopic (N, total) | `PaperTopic.paperId (part of PK)` | Identifying relationship of the weak entity PaperTopic. |
| 11 | classifies | 1:N | ResearchTopic (1, partial) - PaperTopic (N, partial) | `PaperTopic.topicId` |  |
| 12 | is parent of | 1:N | ResearchTopic (1, partial) - ResearchTopic (N, partial) | `ResearchTopic.parentTopicId` |  |
| 13 | requests report | 1:N | User (1, partial) - Report (N, total) | `Report.userId` |  |
| 14 | cites | N:M | Report (N, partial) - Paper (M, partial) | `ReportPaper.reportId, ReportPaper.paperId` |  |
| 15 | runs analysis | 1:N | User (1, partial) - GapAnalysis (N, total) | `GapAnalysis.userId` |  |
| 16 | analyzes | N:M | GapAnalysis (N, partial) - Paper (M, partial) | `GapAnalysisPaper.analysisId, GapAnalysisPaper.paperId` |  |
| 17 | produces | 1:N | GapAnalysis (1, partial) - ResearchGap (N, partial) | `ResearchGap.analysisId` |  |
| 18 | suggests | 1:N | Report (1, partial) - ResearchGap (N, partial) | `ResearchGap.sourceReportId` |  |
| 19 | grounded in | N:M | ResearchGap (N, partial) - Paper (M, partial) | `ResearchGapPaper.gapId, ResearchGapPaper.paperId` |  |
| 20 | receives vote | 1:N | ResearchGap (1, partial) - GapValidation (N, total) | `GapValidation.gapId` |  |
| 21 | validates | 1:N | User (1, partial) - GapValidation (N, total) | `GapValidation.reviewerId` |  |
| 22 | has ledger entry | 1:N | User (1, partial) - CreditTransaction (N, total) | `CreditTransaction.userId` |  |
| 23 | refunds | 1:N | CreditTransaction (1, partial) - CreditTransaction (N, partial) | `CreditTransaction.refundedTransactionId` | refundCreditsOnce writes at most one refund per charge (idempotency key refund:<chargeId> is UNIQUE); the FK column itself is not UNIQUE, so the diagram shows the database cardinality 1:N. |
| 24 | charges report | 1:N | CreditTransaction (1, partial) - Report (N, partial) | `Report.creditTransactionId` | A charge belongs to one report by business rule, but reports.credit_transaction_id has no UNIQUE constraint, so the database allows 1:N. |
| 25 | charges analysis | 1:N | CreditTransaction (1, partial) - GapAnalysis (N, partial) | `GapAnalysis.creditTransactionId` | Same as 'charges report' for gap analyses. |
| 26 | places order | 1:N | User (1, partial) - PaymentOrder (N, total) | `PaymentOrder.userId` |  |
| 27 | receives | 1:N | User (1, partial) - Notification (N, partial) | `Notification.userId` |  |
| 28 | performs | 1:N | User (1, partial) - AuditLog (N, partial) | `AuditLog.userId` |  |
| 29 | configures | 1:N | User (1, partial) - UserAiConnection (N, total) | `UserAiConnection.userId` |  |
| 30 | owns | 1:N | User (1, partial) - Project (N, total) | `Project.ownerId` |  |
| 31 | is member of | N:M | User (N, partial) - Project (M, partial) | `ProjectMember.userId, ProjectMember.projectId (UNIQUE pair)` |  |
| 32 | collects | N:M | Project (N, partial) - Paper (M, partial) | `ProjectPaper.projectId, ProjectPaper.paperId (UNIQUE pair)` |  |
| 33 | scopes report | 1:N | Project (1, partial) - Report (N, partial) | `Report.projectId` |  |
| 34 | scopes analysis | 1:N | Project (1, partial) - GapAnalysis (N, partial) | `GapAnalysis.projectId` |  |
| 35 | has plan | 1:1 | Project (1, partial) - ResearchPlan (1, total) | `ResearchPlan.projectId (UNIQUE)` |  |
| 36 | contains | 1:N | Project (1, partial) - ProjectTask (N, total) | `ProjectTask.projectId` |  |
| 37 | requests mentor | 1:N | Project (1, partial) - MentorshipRequest (N, total) | `MentorshipRequest.projectId` |  |
| 38 | is invited as mentor | 1:N | User (1, partial) - MentorshipRequest (N, total) | `MentorshipRequest.mentorUserId` |  |
| 39 | becomes | 1:1 | MentorshipRequest (1, partial) - MentorRelationship (1, total) | `MentorRelationship.sourceRequestId (UNIQUE)` |  |
| 40 | is mentored in | 1:N | Project (1, partial) - MentorRelationship (N, total) | `MentorRelationship.projectId` |  |
| 41 | opens | 1:N | Project (1, partial) - RecruitmentOpening (N, total) | `RecruitmentOpening.projectId` |  |
| 42 | receives application | 1:N | RecruitmentOpening (1, partial) - RecruitmentApplication (N, total) | `RecruitmentApplication.openingId` |  |
| 43 | applies | 1:N | User (1, partial) - RecruitmentApplication (N, total) | `RecruitmentApplication.applicantId` |  |
| 44 | drafts in | 1:N | Project (1, partial) - DraftWorkspace (N, total) | `DraftWorkspace.projectId` |  |
| 45 | submits | 1:N | Project (1, partial) - Submission (N, total) | `Submission.projectId` |  |
| 46 | is submitted as | 1:1 | Report (1, partial) - Submission (1, partial) | `Submission.sourceReportId (UNIQUE)` |  |
| 47 | has revision | 1:N | Submission (1, partial) - SubmissionRevision (N, total) | `SubmissionRevision.submissionId` |  |
| 48 | is pre-reviewed by | 1:N | Submission (1, partial) - AiPreReview (N, total) | `AiPreReview.submissionId` |  |
| 49 | requests review | 1:N | Submission (1, partial) - ReviewRequest (N, total) | `ReviewRequest.submissionId` |  |
| 50 | is reviewed in | 1:N | SubmissionRevision (1, partial) - ReviewRequest (N, total) | `ReviewRequest.artifactRevisionId` |  |
| 51 | assigns | 1:1 | ReviewRequest (1, partial) - ReviewerAssignment (1, partial) | `ReviewerAssignment.reviewRequestId (UNIQUE)` |  |
| 52 | reviews as | 1:N | User (1, partial) - ReviewerAssignment (N, total) | `ReviewerAssignment.reviewerId` |  |
| 53 | produces round | 1:N | ReviewerAssignment (1, partial) - HumanReview (N, total) | `HumanReview.assignmentId` |  |
| 54 | has version | 1:N | ReviewTemplate (1, partial) - ReviewTemplateVersion (N, total) | `ReviewTemplateVersion.templateId` |  |
| 55 | is used by | 1:N | ReviewTemplateVersion (1, partial) - ReviewRequest (N, total) | `ReviewRequest.templateVersionId` |  |
| 56 | joins | N:M | User (N, partial) - Community (M, partial) | `CommunityMembership.userId, CommunityMembership.communityId (UNIQUE pair)` |  |
| 57 | hosts | 1:N | Community (1, partial) - ForumPost (N, partial) | `ForumPost.communityId` |  |
| 58 | authors post | 1:N | User (1, partial) - ForumPost (N, total) | `ForumPost.authorId` |  |
| 59 | has comment | 1:N | ForumPost (1, partial) - ForumComment (N, total) | `ForumComment.postId` |  |
| 60 | replies to | 1:N | ForumComment (1, partial) - ForumComment (N, partial) | `ForumComment.parentCommentId` |  |
| 61 | writes comment | 1:N | User (1, partial) - ForumComment (N, total) | `ForumComment.authorId` |  |
| 62 | is reported in | 1:N | ForumPost (1, partial) - ContentReport (N, partial) | `ContentReport.postId` |  |
| 63 | flags comment | 1:N | ForumComment (1, partial) - ContentReport (N, partial) | `ContentReport.commentId` |  |
| 64 | files report | 1:N | User (1, partial) - ContentReport (N, total) | `ContentReport.reporterId` |  |
| 65 | discusses gap | 1:N | ResearchGap (1, partial) - ForumPost (N, partial) | `ForumPost.linkedResearchGapId` |  |
| 66 | references paper | 1:N | Paper (1, partial) - ForumPost (N, partial) | `ForumPost.linkedPaperId` |  |
| 67 | showcases project | 1:N | Project (1, partial) - ForumPost (N, partial) | `ForumPost.linkedProjectId` |  |
| 68 | accepts answer | 1:N | ForumComment (1, partial) - ForumPost (N, partial) | `ForumPost.acceptedCommentId` | forum_posts.accepted_comment_id has no UNIQUE constraint; the database cardinality is 1:N. |
| 69 | assesses revision | 1:N | SubmissionRevision (1, partial) - HumanReview (N, total) | `HumanReview.revisionId` |  |
| 70 | follows rubric | 1:N | ReviewTemplateVersion (1, partial) - HumanReview (N, partial) | `HumanReview.templateVersionId` |  |
| 71 | is current revision of | 1:N | SubmissionRevision (1, partial) - Submission (N, partial) | `Submission.currentRevisionId` | submissions.current_revision_id has no UNIQUE constraint; the database cardinality is 1:N (business intent: one current revision per submission). |
| 72 | concerns institution | 1:N | Institution (1, partial) - VerificationEvidence (N, partial) | `VerificationEvidence.institutionId` |  |
| 73 | resubmits | 1:N | VerificationEvidence (1, partial) - VerificationEvidence (N, partial) | `VerificationEvidence.previousRequestId` | previous_request_id has no UNIQUE constraint; the database cardinality is 1:N. |
| 74 | defines rubric | 1:N | Project (1, partial) - ReviewTemplate (N, partial) | `ReviewTemplate.projectId` |  |
| 75 | scopes gap | 1:N | Project (1, partial) - ResearchGap (N, partial) | `ResearchGap.projectId` |  |

Total-participation lines (double): **39**; all other entity-relationship lines are single (partial).


## Foreign keys not drawn (51 of 120 FK constraints held by the drawn entities)

The diagram shows **69** of the **120** FK constraints that the 41 drawn entities hold. It also shows the FKs of the 6 join tables drawn as N:M diamonds. The FKs below are real and enforced in the database, but they are **not** drawn. This is a deliberate overview choice, so the diagram is **not** a 100% complete picture of the schema's FKs.

| Category | Meaning | Count |
|---|---|---|
| A | Actor / audit reference (who created, decided, reviewed, uploaded, assigned or updated the record) | 22 |
| B | Ownership or assignment link to User, omitted only to keep the User hub readable | 6 |
| C | Denormalised copy: the same fact is reachable through relationships already drawn | 8 |
| D | Secondary or technical pointer (current-version pointer, lineage, legacy alias, second scope, context link) | 5 |
| F | Target model is outside the 41-entity overview | 10 |

| Cat. | FK column | References | Nullable | Detail |
|---|---|---|---|---|
| A | `AcademicProfile.rejectedById` | User | yes |  |
| A | `AcademicProfile.verifiedById` | User | yes |  |
| A | `AiPreReview.requestedById` | User | no |  |
| A | `Community.reviewedById` | User | yes |  |
| A | `ContentReport.reviewedById` | User | yes |  |
| A | `DraftWorkspace.createdById` | User | no |  |
| A | `MentorshipRequest.requestedBy` | User | no |  |
| A | `Paper.requestedById` | User | yes |  |
| A | `Paper.uploadedById` | User | yes |  |
| A | `Project.createdById` | User | yes |  |
| A | `ProjectTask.completedById` | User | yes |  |
| A | `ProjectTask.createdById` | User | no |  |
| A | `RecruitmentApplication.decidedById` | User | yes |  |
| A | `RecruitmentOpening.createdById` | User | no |  |
| A | `ResearchPlan.updatedById` | User | yes |  |
| A | `ReviewRequest.requesterId` | User | no |  |
| A | `ReviewTemplateVersion.createdById` | User | yes |  |
| A | `ReviewerAssignment.assignedById` | User | no |  |
| A | `Submission.createdById` | User | no |  |
| A | `SubmissionRevision.uploadedById` | User | no |  |
| A | `User.accountStatusChangedById` | User | yes |  |
| A | `VerificationEvidence.reviewedById` | User | yes |  |
| B | `Community.ownerId` | User | no |  |
| B | `HumanReview.reviewerId` | User | no |  |
| B | `MentorRelationship.mentorUserId` | User | no |  |
| B | `ProjectTask.assigneeId` | User | yes |  |
| B | `ResearchGap.userId` | User | no |  |
| B | `ReviewTemplate.ownerId` | User | yes |  |
| C | `ContentReport.communityId` | Community | yes |  |
| C | `ContentReport.researchCommunityId` | Community | yes |  |
| C | `HumanReview.submissionId` | Submission | no |  |
| C | `HumanReview.templateId` | ReviewTemplate | yes |  |
| C | `RecruitmentApplication.projectId` | Project | no |  |
| C | `ReviewRequest.projectId` | Project | no |  |
| C | `ReviewerAssignment.artifactRevisionId` | SubmissionRevision | yes |  |
| C | `ReviewerAssignment.submissionId` | Submission | no |  |
| D | `ForumPost.researchCommunityId` | Community | yes | optional research-community scope used for moderation, besides the drawn forum category |
| D | `ForumPost.researchGapId` | ResearchGap | yes | legacy column; the API maps a `researchGapId` input onto `linkedResearchGapId`, which is drawn |
| D | `Notification.paperId` | Paper | yes | optional context link of a notification |
| D | `ReviewTemplate.activeVersionId` | ReviewTemplateVersion | yes | pointer to the active version; the versions themselves are drawn through 'has version' |
| D | `SubmissionRevision.sourceRevisionId` | SubmissionRevision | yes | revision lineage (self-reference) |
| F | `DraftWorkspace.mainFileId` | ManuscriptFile | yes |  |
| F | `MentorshipRequest.applicationId, projectId, mentorUserId` | MentorshipApplication | yes |  |
| F | `MentorshipRequest.candidateId` | MentorCandidate | yes |  |
| F | `ProjectTask.milestoneId, projectId` | ProjectMilestone | yes |  |
| F | `ResearchGap.corpusId` | LiteratureCorpus | yes |  |
| F | `ResearchGap.latestClosureCheckId` | GapClosureCheck | yes |  |
| F | `SubmissionRevision.attributionCheckId` | ManuscriptAttributionCheck | yes |  |
| F | `SubmissionRevision.integrityReportId` | ManuscriptIntegrityRecord | yes |  |
| F | `SubmissionRevision.integrityReportId, manuscriptSnapshotId` | ManuscriptIntegrityRecord | yes |  |
| F | `SubmissionRevision.manuscriptSnapshotId` | ManuscriptSnapshot | yes |  |

## Models not drawn on the overview (196 of 243)

The overview shows the core entity of each business flow. The models below are implemented, but they are detail, history, audit or infrastructure tables. Report 4 (Physical ERD) covers them per module.

| Prisma file | Models |
|---|---|
| `collaboration.prisma` | CopyrightClaim, DraftWorkspaceMember, ForumCommentRevision, ForumModerationAction, ForumPostDailyView, ForumPostGap, ForumPostPaper, ForumPostProject, ForumPostRevision, ForumPostTag, ForumPostView, ForumReaction, ForumReference, ForumRestriction, ForumTag, ForumThreadFollow, ForumVote, MentorCandidate, MentorInvitationPlan, MentorSuggestion, ModerationAppeal, ProjectActivity, ProjectChatCitation, ProjectChatMessage, ProjectContributionHistory, ProjectContributionProposal, ProjectInvitation, ProjectTeamMessage, ProjectTeamMessageRead, SectionRevision, UserTopicFollow, UserTopicMute, WorkspaceComment, WorkspaceSection |
| `contribution-evaluation.prisma` | ContributionEvaluationDecision, ContributionEvaluationRule, ContributionEvaluationRun, ContributionEvaluationSnapshot, ContributionEvaluationState, ContributionOutcome, ContributionOutcomeEvaluation, ContributionOutcomeSource |
| `github.prisma` | GithubConnection |
| `identity.prisma` | AcademicEmailVerificationChallenge, AcademicFeaturedWork, AcademicIdentityLink, AcademicProfileHandle, AcademicProgram, AcademicVerificationEvidence, Campus, EmailVerificationToken, InstitutionDomain, OAuthAccount, PasswordResetToken, RefreshToken, UserCapability, UserDisplayNameChange, UserEmail, VerificationEvidenceDeletion, VerificationEvidenceSource, VerificationEvidenceUpload |
| `knowledge.prisma` | KnowledgeEntity, KnowledgeRelation, PaperChunk, PaperDocument |
| `manuscript-integrity.prisma` | ManuscriptAiAcceptance, ManuscriptIntegrityAcknowledgement, ManuscriptIntegrityRecord |
| `manuscript.prisma` | ManuscriptAttributionCheck, ManuscriptAttributionDecision, ManuscriptCompilation, ManuscriptFile, ManuscriptRemoteBinding, ManuscriptSnapshot, ManuscriptSnapshotAsset, ManuscriptSuggestion, ManuscriptUpdate, ManuscriptWritingReport |
| `mentor-access.prisma` | MentorAccess, MentorAccessEvent, MentorAgreement, MentorFeedback, MentorResourceShare |
| `mentorship-application.prisma` | MentorshipApplication, MentorshipApplicationEvent, MentorshipApplicationNote |
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

- **Journal** is read by `papers/paper.service.ts`, but no service in `apps/backend/src` writes it. Its rows come from the legacy data migration or from ingestion outside the API, so the write path needs verification.
- **Payment and ledger link.** PaymentOrder has no FK to CreditTransaction. A paid order is linked to its reward ledger row only by the idempotency key `payos:<orderCode>`, so the diagram draws no relationship between them.
- **Dead status values** (allowed by CHECK constraints but never written by code): ReviewRequest `SUBMITTED`; Submission `accepted`, `rejected`, `withdrawn`; PaymentOrder `cancelled`, `expired`; VerificationEvidence `UNVERIFIED`, `NOT_SUBMITTED`, `EXPIRED`. These do not change the ERD.
- **Proposed, not built (BM04 RF-31 / RF-32):** a lecturer's field mapped to the OpenAlex taxonomy, and credibility evidence shown on the directory. ResearchTopic already exists, but no table links a lecturer to topics for this purpose yet, so nothing is drawn.
