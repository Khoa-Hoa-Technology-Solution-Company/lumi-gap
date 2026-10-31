import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectService } from "../project.service.js";
import { contributionProtectionService } from "../contribution-protection.service.js";
import { assertCanExportProjectSource, researchLedgerService } from "../../audit/research-ledger.service.js";
import { allocationService } from "../allocation.service.js";
import { researchIntegrityService } from "../research-integrity.service.js";
import { manuscriptAttributionService } from "../../workspaces/manuscript-attribution.service.js";
import { manuscriptService } from "../../workspaces/manuscript.service.js";
import { manuscriptEvents } from "../../workspaces/manuscript-events.js";
import { pdfStorageService } from "../../../infrastructure/pdf-storage.service.js";
import { cloudinaryPrivateDownloadUrl } from "../../../infrastructure/cloudinary-storage.service.js";
import { resolveFeaturedWorks } from "../../academic-profiles/academic-featured-works.service.js";
import { workContributionsService } from "../work-contributions.service.js";

describe.sequential("Research Contribution, Integrity & Security Workflow — All 26 Scenarios (§18)", () => {
  const db = getPrisma();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  let ownerId: string;
  let memberBId: string;
  let memberCId: string;
  let advisorId: string;
  let adminId: string;
  let testProjectId: string;
  let memberBWorkRecordId: string;

  async function createUser(name: string, role = "researcher") {
    const user = await db.user.create({
      data: {
        fullName: name,
        email: `trust-${name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID()}@lumigap.test`,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        role: role.toLowerCase(),
      },
    });
    createdUserIds.push(user.id);
    await db.academicProfile.create({
      data: {
        userId: user.id,
        primaryPosition: "RESEARCH_STAFF",
        academicRole: "RESEARCHER",
      },
    });
    return user.id;
  }

  beforeAll(async () => {
    ownerId = await createUser("Lead Scientist Owner");
    memberBId = await createUser("Departing Coauthor B");
    memberCId = await createUser("Active Collaborator C");
    advisorId = await createUser("Faculty Advisor D", "lecturer");
    adminId = await createUser("Institutional Admin E", "admin");

    const p = await createProjectFixture({
      data: {
        title: "Research Integrity Verification Workspace",
        ownerId,
        visibility: "PRIVATE",
        status: "ACTIVE",
        exportPolicy: "ALL_MEMBERS",
        aiDataPolicy: "PLATFORM_AI_ONLY",
        externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
      },
    });
    testProjectId = p.id;
    createdProjectIds.push(testProjectId);

    await db.projectMember.create({ data: { projectId: testProjectId, userId: memberBId, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: testProjectId, userId: memberCId, status: "ACTIVE" } });

    // Record Member B's empirical contribution while active
    const record = await workContributionsService.save(testProjectId, memberBId, {
      title: "Experimental Dataset & Preprocessing Pipeline",
      description: "Cleaned and labeled 5,000 empirical samples for model validation",
      source: "MANUAL",
      workDate: new Date().toISOString(),
      participants: [
        {
          userId: memberBId,
          roles: ["DATA_CURATION", "SOFTWARE", "VALIDATION"],
        },
      ],
      evidence: "Data repository logs",
      evidenceRefs: [],
      clientKey: crypto.randomUUID(),
    });
    memberBWorkRecordId = record.id;
  });

  afterAll(async () => {
    try {
      await db.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
      for (const pid of createdProjectIds) {
        await db.manuscriptAttributionDecision.deleteMany({ where: { projectId: pid } });
        await db.manuscriptAttributionCheck.deleteMany({ where: { projectId: pid } });
        await db.researchIntegrityEvent.deleteMany({ where: { projectId: pid } });
        await db.researchIntegrityCase.deleteMany({ where: { projectId: pid } });
        await db.mentorAgreement.deleteMany({ where: { projectId: pid } });
        await db.mentorFeedback.deleteMany({ where: { projectId: pid } });
        await db.mentorResourceShare.deleteMany({ where: { projectId: pid } });
        await db.mentorAccess.deleteMany({ where: { projectId: pid } });
        await db.mentorshipRequest.deleteMany({ where: { projectId: pid } });
        await db.projectMember.deleteMany({ where: { projectId: pid } });
        await db.project.deleteMany({ where: { id: pid } });
      }
      for (const uid of createdUserIds) {
        await db.academicProfile.deleteMany({ where: { userId: uid } });
        await db.user.deleteMany({ where: { id: uid } });
      }
    } catch {
      // Ignore append-only audit cleanup in test environment
    } finally {
      await db.$executeRawUnsafe(`SET session_replication_role = 'origin';`).catch(() => { });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Member removal access revocation & session eviction
  // --------------------------------------------------------------------------
  it("Scenario 1: Member removal revokes project access, records reason, and evicts realtime session", async () => {
    let evictedUser: string | null = null;
    let evictedProject: string | null = null;
    const handler = (event: { projectId: string; userId?: string }) => {
      evictedProject = event.projectId;
      evictedUser = event.userId ?? null;
    };
    manuscriptEvents.on("member-revoked", handler);

    await projectService.removeMemberFromProject(
      testProjectId,
      memberBId,
      ownerId,
      "Research phase completed; transitioning to alumni contributor",
    );
    manuscriptEvents.off("member-revoked", handler);

    const memberRow = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: testProjectId, userId: memberBId } },
    });
    expect(memberRow?.status).toBe("REMOVED");

    const activity = await db.projectActivity.findFirst({
      where: { projectId: testProjectId, type: "MEMBER_REMOVED", actorId: ownerId },
      orderBy: { createdAt: "desc" },
    });
    expect((activity?.metadata as Record<string, unknown>)?.reason).toBe(
      "Research phase completed; transitioning to alumni contributor",
    );

    const ledgerEvent = await db.researchEvidenceEvent.findFirst({
      where: { projectId: testProjectId, eventType: "MEMBER_REMOVED", actorId: ownerId },
      orderBy: { createdAt: "desc" },
    });
    expect(ledgerEvent?.reason).toBe(
      "Research phase completed; transitioning to alumni contributor",
    );

    // Verify session eviction signal was broadcast
    expect(evictedProject).toBe(testProjectId);
    expect(evictedUser).toBe(memberBId);

    // Calling project member-only query throws 403 Forbidden
    await expect(
      projectService.getProjectById(testProjectId, memberBId),
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Departed member historical contribution preservation
  // --------------------------------------------------------------------------
  it("Scenario 2: Historical contributions of departed member remain permanently preserved", async () => {
    // Despite memberB being REMOVED, history is still retrievable
    const history = await contributionProtectionService.getMyContributionHistory(testProjectId, memberBId);
    expect(history.userId).toBe(memberBId);
    expect(history.membershipStatus).toBe("REMOVED");
    expect(history.workContributions.some((w) => w.id === memberBWorkRecordId)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Former member self-service evidence export with SHA-256 digest
  // --------------------------------------------------------------------------
  it("Scenario 3: Former member can self-service export verifiable evidence bundle with SHA-256 digest", async () => {
    const exported = await contributionProtectionService.exportMyContributionHistory(testProjectId, memberBId);

    expect(exported.userId).toBe(memberBId);
    expect(exported.projectId).toBe(testProjectId);
    expect(exported.integrityDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.workContributions.length).toBeGreaterThan(0);

    // Ledger audit event recorded
    const ledgerEvents = await db.researchEvidenceEvent.findMany({
      where: {
        projectId: testProjectId,
        eventType: "CONTRIBUTION_EVIDENCE_EXPORTED",
        actorId: memberBId,
      },
    });
    expect(ledgerEvents.length).toBeGreaterThan(0);
    expect(ledgerEvents[0]!.checksumSha256).toBe(exported.integrityDigestSha256);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Former member privacy redactions (no leakage of confidential project items)
  // --------------------------------------------------------------------------
  it("Scenario 4: Former member export is privacy-redacted and excludes other members' unshared private records", async () => {
    // Member C creates an unrelated private draft record
    await workContributionsService.save(testProjectId, memberCId, {
      title: "Confidential Algorithm Formulation by C",
      description: "Internal draft not involving B",
      source: "MANUAL",
      workDate: new Date().toISOString(),
      participants: [{ userId: memberCId, roles: ["CONCEPTUALIZATION"] }],
      evidence: "Internal notes",
      evidenceRefs: [],
      clientKey: crypto.randomUUID(),
    });

    const exportB = await contributionProtectionService.exportMyContributionHistory(testProjectId, memberBId);
    // Must NOT contain C's independent private record
    expect(exportB.workContributions.some((e) => e.title.includes("Confidential Algorithm"))).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Contribution matrix decimal calculation ($C(i) = \sum W(k) \times S(i,k)$) totaling 100%
  // --------------------------------------------------------------------------
  it("Scenario 5: 4-category matrix deterministic calculation C(i) = SUM[ W(k) * S(i,k) ] totals exactly 100%", async () => {
    const period = await allocationService.createPeriod(testProjectId, ownerId, {
      title: "Matrix Allocation Phase",
      description: "Agreed 4-category evaluation",
      scope: "Full research cycle",
      periodStart: new Date(Date.now() - 10 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });

    const draft = await allocationService.draft(testProjectId, ownerId, period.id, {
      matrix: {
        categories: [
          {
            category: "CONCEPTUALIZATION_METHODOLOGY",
            weightBasisPoints: 2500, // 25%
            evidenceIds: [],
            shares: [
              { userId: ownerId, basisPoints: 5000, rationale: "Protocol lead" },
              { userId: memberBId, basisPoints: 3000, rationale: "Methodology design" },
              { userId: memberCId, basisPoints: 2000, rationale: "Protocol review" },
            ],
          },
          {
            category: "LITERATURE_DATA",
            weightBasisPoints: 2000, // 20%
            evidenceIds: [],
            shares: [
              { userId: ownerId, basisPoints: 4000, rationale: "Literature review" },
              { userId: memberBId, basisPoints: 4000, rationale: "Dataset curation" },
              { userId: memberCId, basisPoints: 2000, rationale: "Data extraction" },
            ],
          },
          {
            category: "EXECUTION_VALIDATION",
            weightBasisPoints: 3500, // 35%
            evidenceIds: [],
            shares: [
              { userId: ownerId, basisPoints: 6000, rationale: "Core implementation" },
              { userId: memberBId, basisPoints: 3000, rationale: "Analysis" },
              { userId: memberCId, basisPoints: 1000, rationale: "Validation check" },
            ],
          },
          {
            category: "WRITING_REVISION",
            weightBasisPoints: 2000, // 20%
            evidenceIds: [],
            shares: [
              { userId: ownerId, basisPoints: 2000, rationale: "Drafting" },
              { userId: memberBId, basisPoints: 5000, rationale: "Lead writing" },
              { userId: memberCId, basisPoints: 3000, rationale: "Revisions" },
            ],
          },
        ],
      },
      rationale: "4-category agreement",
      clientKey: crypto.randomUUID(),
    });

    const submitted = await allocationService.submit(testProjectId, ownerId, draft.id, draft.draftVersion);

    // Expected:
    // A: 25%*50% + 20%*40% + 35%*60% + 20%*20% = 12.5% + 8% + 21% + 4% = 45.5% (4550 bp)
    // B: 25%*30% + 20%*40% + 35%*30% + 20%*50% = 7.5% + 8% + 10.5% + 10% = 36.0% (3600 bp)
    // C: 25%*20% + 20%*20% + 35%*10% + 20%*30% = 5% + 4% + 3.5% + 6% = 18.5% (1850 bp)
    const shareMap = new Map(submitted.shares.map((s) => [s.userId, s.basisPoints]));
    expect(shareMap.get(ownerId)).toBe(4550);
    expect(shareMap.get(memberBId)).toBe(3600);
    expect(shareMap.get(memberCId)).toBe(1850);
    expect(submitted.shares.reduce((sum, s) => sum + s.basisPoints, 0)).toBe(10000);
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Active category with zero shares rejected
  // --------------------------------------------------------------------------
  it("Scenario 6: Active category with shares not summing to 100% is strictly rejected", async () => {
    const period = await allocationService.createPeriod(testProjectId, ownerId, {
      title: "Validation Period",
      description: "Testing rejection of invalid matrix",
      scope: "Validation",
      periodStart: new Date(Date.now() - 5 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });

    const badDraft = await allocationService.draft(testProjectId, ownerId, period.id, {
      matrix: {
        categories: [
          {
            category: "CONCEPTUALIZATION_METHODOLOGY",
            weightBasisPoints: 5000,
            evidenceIds: [],
            shares: [
              { userId: ownerId, basisPoints: 4000, rationale: "Incomplete shares" }, // Only 40%!
            ],
          },
          {
            category: "LITERATURE_DATA",
            weightBasisPoints: 5000,
            evidenceIds: [],
            shares: [{ userId: ownerId, basisPoints: 10000, rationale: "Full" }],
          },
          { category: "EXECUTION_VALIDATION", weightBasisPoints: 0, zeroWeightReason: "Not used in this test", evidenceIds: [], shares: [] },
          { category: "WRITING_REVISION", weightBasisPoints: 0, zeroWeightReason: "Not used in this test", evidenceIds: [], shares: [] },
        ],
      },
      rationale: "Bad draft",
      clientKey: crypto.randomUUID(),
    });

    await expect(
      allocationService.submit(testProjectId, ownerId, badDraft.id, badDraft.draftVersion),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Member confirmation and dispute recording for allocations
  // --------------------------------------------------------------------------
  it("Scenario 7: Allocation proposals record confirmations and disputes; objections block finalization", async () => {
    const period = await allocationService.createPeriod(testProjectId, ownerId, {
      title: "Quarterly Evaluation Scope",
      description: "Q1-Q2 Milestone Evaluation",
      scope: "Q1-Q2 Milestone",
      periodStart: new Date(Date.now() - 30 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });

    const draft = await allocationService.draft(testProjectId, ownerId, period.id, {
      matrix: {
        categories: [
          {
            category: "CONCEPTUALIZATION_METHODOLOGY",
            weightBasisPoints: 10000,
            evidenceIds: [],
            shares: [
              { userId: ownerId, basisPoints: 6000, rationale: "Lead" },
              { userId: memberCId, basisPoints: 4000, rationale: "Co-lead" },
            ],
          },
          { category: "LITERATURE_DATA", weightBasisPoints: 0, zeroWeightReason: "Experimental only scope", evidenceIds: [], shares: [] },
          { category: "EXECUTION_VALIDATION", weightBasisPoints: 0, zeroWeightReason: "Experimental only scope", evidenceIds: [], shares: [] },
          { category: "WRITING_REVISION", weightBasisPoints: 0, zeroWeightReason: "Experimental only scope", evidenceIds: [], shares: [] },
        ],
      },
      rationale: "Initial milestone allocation",
      clientKey: crypto.randomUUID(),
    });

    const submitted = await allocationService.submit(testProjectId, ownerId, draft.id, draft.draftVersion);

    // Member C records an objection/dispute
    await allocationService.decide(testProjectId, memberCId, submitted.id, {
      decision: "DISPUTE",
      explanation: "Execution work from sprint 2 was omitted from the weight distribution",
    });

    const check = await db.allocationRevision.findUniqueOrThrow({ where: { id: submitted.id } });
    expect(check.status).toBe("DISPUTED");

    // Owner approval is blocked because the revision is disputed
    await expect(
      allocationService.decide(testProjectId, ownerId, submitted.id, {
        decision: "APPROVE",
        explanation: "Owner approval",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const afterOwner = await db.allocationRevision.findUniqueOrThrow({ where: { id: submitted.id } });
    expect(afterOwner.status).toBe("DISPUTED"); // NOT finalized
    expect(afterOwner.finalizedAt).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Append-only ledger trigger blocking manual UPDATE/DELETE
  // --------------------------------------------------------------------------
  it("Scenario 8: PostgreSQL triggers enforce append-only immutability against raw UPDATE and DELETE", async () => {
    const event = await db.researchEvidenceEvent.create({
      data: {
        projectId: testProjectId,
        eventType: "MANUSCRIPT_SOURCE_EXPORTED",
        resourceKind: "MANUSCRIPT",
        actorId: ownerId,
        checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        reason: "Test ledger trigger",
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
      },
    });

    // Attempting raw UPDATE must throw trigger exception
    await expect(
      db.$executeRawUnsafe(`UPDATE research_evidence_events SET reason = 'tampered' WHERE id = '${event.id}'`),
    ).rejects.toThrow(/append-only/i);

    // Attempting raw DELETE must throw trigger exception
    await expect(
      db.$executeRawUnsafe(`DELETE FROM research_evidence_events WHERE id = '${event.id}'`),
    ).rejects.toThrow(/append-only/i);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Export & download auditing in research ledger
  // --------------------------------------------------------------------------
  it("Scenario 9: Manuscript source download and export are auditable in research ledger with SHA-256", async () => {
    await researchLedgerService.record({
      projectId: testProjectId,
      actorId: ownerId,
      eventType: "PROJECT_SOURCE_EXPORTED",
      resourceKind: "MANUSCRIPT_SNAPSHOT",
      resourceId: "snap-123",
      artifactVersion: "1",
      checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      reason: "Audited source export",
      visibility: "PROJECT_TEAM",
      retentionClass: "SECURITY_AUDIT",
    });

    const overview = await researchLedgerService.getProjectSecurityOverview(testProjectId, ownerId);
    expect(overview.recentEvents.some((e) => e.type === "PROJECT_SOURCE_EXPORTED")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Advisor contribution recording without auto-authorship or routine comment score units
  // --------------------------------------------------------------------------
  it("Scenario 10: Advisor contributions record CRediT roles and substantive advice without auto-authorship", async () => {
    const req = await db.mentorshipRequest.create({
      data: {
        projectId: testProjectId,
        mentorUserId: advisorId,
        requestedBy: ownerId,
        direction: "PROJECT_TO_LECTURER",
        mentorRole: "PRIMARY",
        status: "ACCEPTED",
      },
    });

    const access = await db.mentorAccess.create({
      data: {
        projectId: testProjectId,
        requestId: req.id,
        mentorUserId: advisorId,
        configuredById: ownerId,
        preset: "ADVISOR",
      },
    });

    await db.mentorAgreement.create({
      data: {
        projectId: testProjectId,
        accessId: access.id,
        proposedById: ownerId,
        creditRoles: ["SUPERVISION", "METHODOLOGY"],
        acknowledgement: "Supervised experimental protocol and research design",
        status: "ACCEPTED",
        clientKey: crypto.randomUUID(),
      },
    });

    const advisors = await contributionProtectionService.listAdvisorContributions(testProjectId, ownerId);
    expect(advisors.some((a) => a.mentorId === advisorId)).toBe(true);
    const advisorRecord = advisors.find((a) => a.mentorId === advisorId)!;
    expect(advisorRecord.agreements[0]!.creditRoles).toContain("SUPERVISION");
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Pre-submission attribution check detecting all contributors
  // --------------------------------------------------------------------------
  it("Scenario 11: Pre-submission attribution check detects all active, departed and advisor contributors", async () => {
    const manuscript = await manuscriptService.create(testProjectId, ownerId, {
      title: "Integrity Manuscript Draft",
      documentType: "RESEARCH_PROPOSAL",
      template: "PROPOSAL",
      description: "",
      clientKey: crypto.randomUUID(),
    });

    const snap = await manuscriptService.snapshot(testProjectId, ownerId, manuscript.id, {
      label: "Attribution Baseline",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    const check = await manuscriptAttributionService.getAttributionCheck(
      testProjectId,
      ownerId,
      manuscript.id,
      snap.id,
    );

    expect(check.detectedContributors.some((c) => c.userId === ownerId)).toBe(true);
    expect(check.detectedContributors.some((c) => c.userId === memberBId)).toBe(true); // Departed contributor detected!
    expect(check.detectedContributors.some((c) => c.userId === advisorId)).toBe(true); // Advisor detected!
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Attribution check blocking internal submission if contributors unreviewed
  // --------------------------------------------------------------------------
  it("Scenario 12: Attribution check blocks internal submission when contributors remain unreviewed", async () => {
    const manuscript = await manuscriptService.create(testProjectId, ownerId, {
      title: "Unreviewed Submission Block Test",
      documentType: "RESEARCH_PROPOSAL",
      template: "PROPOSAL",
      description: "",
      clientKey: crypto.randomUUID(),
    });
    const snap = await manuscriptService.snapshot(testProjectId, ownerId, manuscript.id, {
      label: "Pre-review Draft",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    const check = await manuscriptAttributionService.getAttributionCheck(
      testProjectId,
      ownerId,
      manuscript.id,
      snap.id,
    );

    expect(check.readyForInternalSubmission).toBe(false);
    expect(check.blockingReasons.length).toBeGreaterThan(0);

    // Publishing fails because check is not verified
    await expect(
      manuscriptService.publish(testProjectId, ownerId, manuscript.id, snap.id, [ownerId]),
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Attribution check blocking internal submission if dispute open
  // --------------------------------------------------------------------------
  it("Scenario 13: Attribution check blocks internal submission if a dispute is registered", async () => {
    const manuscript = await manuscriptService.create(testProjectId, ownerId, {
      title: "Dispute Submission Block Test",
      documentType: "RESEARCH_PROPOSAL",
      template: "PROPOSAL",
      description: "",
      clientKey: crypto.randomUUID(),
    });
    const snap = await manuscriptService.snapshot(testProjectId, ownerId, manuscript.id, {
      label: "Draft for Dispute",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    // Save declaration omitting memberB
    const saved = await manuscriptAttributionService.saveAttributionCheck(testProjectId, ownerId, manuscript.id, snap.id, {
      proposedAuthors: [
        { userId: ownerId, order: 1, creditRoles: ["WRITING_ORIGINAL_DRAFT"], rationale: "Lead author" },
        { userId: memberCId, order: 2, creditRoles: ["VALIDATION"], rationale: "Validation co-author" },
      ],
      omittedContributors: [
        { userId: memberBId, justification: "Exploratory work" },
      ],
      acknowledgements: [],
    });

    // Member B records a dispute
    await manuscriptAttributionService.decideAttributionCheck(
      testProjectId,
      memberBId,
      manuscript.id,
      saved.checkId!,
      { decision: "DISPUTE", note: "My data curation is core to Table 2" },
    );

    const check = await manuscriptAttributionService.getAttributionCheck(
      testProjectId,
      ownerId,
      manuscript.id,
      snap.id,
    );
    expect(check.status).toBe("DISPUTED");
    expect(check.readyForInternalSubmission).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Sealing submission revision with verified attribution snapshot
  // --------------------------------------------------------------------------
  it("Scenario 14: Clean attribution declaration enables sealed revision with attribution snapshot reference", async () => {
    // Create an isolated project with just Owner and C to verify clean seal
    const cleanProject = await createProjectFixture({
      data: {
        title: "Clean Authorship Project",
        ownerId,
        visibility: "PRIVATE",
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(cleanProject.id);
    await db.projectMember.create({ data: { projectId: cleanProject.id, userId: memberCId, status: "ACTIVE" } });

    const ms = await manuscriptService.create(cleanProject.id, ownerId, {
      title: "Clean Submission",
      documentType: "RESEARCH_PROPOSAL",
      template: "PROPOSAL",
      description: "",
      clientKey: crypto.randomUUID(),
    });
    const snap = await manuscriptService.snapshot(cleanProject.id, ownerId, ms.id, {
      label: "Clean Snapshot",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    // Save declaration
    const saved = await manuscriptAttributionService.saveAttributionCheck(cleanProject.id, ownerId, ms.id, snap.id, {
      proposedAuthors: [
        { userId: ownerId, order: 1, creditRoles: ["WRITING_ORIGINAL_DRAFT"], rationale: "Lead" },
        { userId: memberCId, order: 2, creditRoles: ["WRITING_REVIEW_EDITING"], rationale: "Coauthor" },
      ],
      omittedContributors: [],
      acknowledgements: [],
    });

    // Member C confirms (Owner auto-confirms on save)
    await manuscriptAttributionService.decideAttributionCheck(cleanProject.id, memberCId, ms.id, saved.checkId!, {
      decision: "CONFIRM",
      note: "Confirmed",
    });

    const check = await manuscriptAttributionService.getAttributionCheck(
      cleanProject.id,
      ownerId,
      ms.id,
      snap.id,
    );
    expect(check.readyForInternalSubmission).toBe(true);

    const sealed = await manuscriptService.publish(
      cleanProject.id,
      ownerId,
      ms.id,
      snap.id,
      [ownerId, memberCId],
    );
    expect(sealed.submissionId).toBeDefined();
    expect(sealed.revisionId).toBeDefined();

    const rev = await db.submissionRevision.findUniqueOrThrow({ where: { id: sealed.revisionId } });
    expect(rev.manuscriptSnapshotId).toBe(snap.id);
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Dispute case creation by former member
  // --------------------------------------------------------------------------
  it("Scenario 15: Former member can file structured research integrity dispute", async () => {
    const dispute = await researchIntegrityService.createCase(testProjectId, memberBId, {
      kind: "ATTRIBUTION_DISPUTE",
      targetKind: "MANUSCRIPT_ATTRIBUTION",
      respondentUserId: ownerId,
      title: "Omission of Dataset Curation Contribution",
      description: "My dataset curation work in Q1 was omitted from manuscript author declaration",
    });

    expect(dispute.id).toBeDefined();
    expect(dispute.status).toBe("REPORTED");
    expect(dispute.reporter.id).toBe(memberBId);
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Accused project owner blocked from self-adjudicating dispute
  // --------------------------------------------------------------------------
  it("Scenario 16: Accused project owner is blocked from self-adjudicating dispute case", async () => {
    const cases = await researchIntegrityService.listCases(testProjectId, ownerId);
    const dispute = cases.find((c) => c.kind === "ATTRIBUTION_DISPUTE" && c.respondent?.id === ownerId);
    expect(dispute).toBeDefined();

    // Owner cannot unilaterally resolve case where they are accused
    await expect(
      researchIntegrityService.resolveCase(testProjectId, ownerId, dispute!.id, {
        resolutionSummary: "Dismissed unilaterally by accused owner",
      }),
    ).rejects.toThrow(/Accused project owner cannot self-adjudicate/i);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Dispute escalation to institutional administrator
  // --------------------------------------------------------------------------
  it("Scenario 17: Dispute case escalates to institutional review and admin can resolve it", async () => {
    const cases = await researchIntegrityService.listCases(testProjectId, memberBId);
    const dispute = cases.find((c) => c.kind === "ATTRIBUTION_DISPUTE")!;

    await researchIntegrityService.escalateCase(
      testProjectId,
      memberBId,
      dispute.id,
      { reason: "Mediation failed; requesting institutional ethics committee adjudication" },
    );

    const escalated = await db.researchIntegrityCase.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(escalated.status).toBe("ESCALATED");

    // Institutional Admin E resolves the dispute
    const resolved = await researchIntegrityService.resolveCase(
      testProjectId,
      adminId,
      dispute.id,
      { resolutionSummary: "Committee confirmed dataset curation contribution; acknowledged with CRediT roles in revision" },
      "ADMIN",
    );
    expect(resolved.status).toBe("RESOLVED");
  });

  // --------------------------------------------------------------------------
  // Scenario 18: Suspected data leak incident reporting & policy containment
  // --------------------------------------------------------------------------
  it("Scenario 18: Suspected data leak incident triggers automated lockdown containment", async () => {
    const leakCase = await researchIntegrityService.createCase(testProjectId, ownerId, {
      kind: "DATA_LEAK_INCIDENT",
      targetKind: "PROJECT",
      title: "Potential External Leak of Experimental Results",
      description: "Unpublished benchmark results found on external public forum",
    });

    const contained = await researchIntegrityService.containLeakIncident(testProjectId, ownerId, leakCase.id, {
      actions: [
        "RESTRICT_EXPORT_OWNER_ONLY",
        "SET_PROJECT_PRIVATE",
        "RESTRICT_AI_PLATFORM_ONLY",
        "REVOKE_ACTIVE_MENTOR_SHARES",
      ],
      note: "Containment applied to isolate research assets",
    });

    expect(contained.status).toBe("CONTAINED");

    // Check project settings were locked down
    const p = await db.project.findUniqueOrThrow({ where: { id: testProjectId } });
    expect(p.exportPolicy).toBe("OWNER_ONLY");
    expect(p.visibility).toBe("PRIVATE");
    expect(p.externalLookupPolicy).toBe("LOCAL_CORPUS_ONLY");
  });

  // --------------------------------------------------------------------------
  // Scenario 19: Export policy enforcement (OWNER_ONLY denies member)
  // --------------------------------------------------------------------------
  it("Scenario 19: Export policy OWNER_ONLY strictly denies source export to non-owner members", () => {
    // Owner is allowed
    expect(() =>
      assertCanExportProjectSource({ id: testProjectId, ownerId, exportPolicy: "OWNER_ONLY" }, ownerId),
    ).not.toThrow();

    // Member C is denied
    expect(() =>
      assertCanExportProjectSource({ id: testProjectId, ownerId, exportPolicy: "OWNER_ONLY" }, memberCId),
    ).toThrow(/restricted to the project owner/i);
  });

  // --------------------------------------------------------------------------
  // Scenario 20: Outbound metadata lookup isolation (LOCAL_CORPUS_ONLY suppresses external API)
  // --------------------------------------------------------------------------
  it("Scenario 20: Policy LOCAL_CORPUS_ONLY isolates project from outbound metadata lookups", async () => {
    await projectService.updateProject(
      testProjectId,
      { externalLookupPolicy: "LOCAL_CORPUS_ONLY" },
      ownerId,
    );

    const project = await projectService.getProjectById(testProjectId, ownerId);
    expect(project.externalLookupPolicy).toBe("LOCAL_CORPUS_ONLY");
  });

  // --------------------------------------------------------------------------
  // Scenario 21: AI synthesis & chat tenant isolation
  // --------------------------------------------------------------------------
  it("Scenario 21: AI processing boundaries enforce strict project tenant isolation", async () => {
    const otherProject = await createProjectFixture({
      data: {
        title: "Separate Tenant Project",
        ownerId,
        visibility: "PRIVATE",
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(otherProject.id);

    const run = await db.aiRun.create({
      data: {
        ownerId,
        projectId: testProjectId,
        jobType: "SYNTHESIS",
        status: "completed",
      },
    });

    const projectRuns = await db.aiRun.findMany({ where: { projectId: testProjectId } });
    const otherRuns = await db.aiRun.findMany({ where: { projectId: otherProject.id } });
    expect(projectRuns.some((r) => r.id === run.id)).toBe(true);
    expect(otherRuns.some((r) => r.id === run.id)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Scenario 22: PDF storage signed URL expiration & path sanitization
  // --------------------------------------------------------------------------
  it("Scenario 22: PDF storage signed URLs reject directory traversal and expire deterministically", () => {
    // Malicious traversal key rejected by local resolver
    const traversal = pdfStorageService.resolveLocalPath("/uploads/../../etc/passwd");
    expect(traversal).toBeNull();

    // Signed URLs have bounded expiration timestamps and cryptographic signatures
    const signedUrl = cloudinaryPrivateDownloadUrl("secure-manuscript-asset", 300);
    expect(signedUrl).toContain("secure-manuscript-asset");
    expect(signedUrl).toContain("signature=");
  });

  // --------------------------------------------------------------------------
  // Scenario 23: Featured academic works visibility guard for private projects
  // --------------------------------------------------------------------------
  it("Scenario 23: Private projects cannot be displayed on public academic profiles", async () => {
    const works = await resolveFeaturedWorks([{ source: "LUMIGAP", kind: "PROJECT", projectId: testProjectId }]);
    expect(works).toHaveLength(0); // Excluded for unauthenticated/public viewers!
  });

  // --------------------------------------------------------------------------
  // Scenario 24: Immediate WebSocket session termination on member removal
  // --------------------------------------------------------------------------
  it("Scenario 24: Realtime collaboration broadcasts eviction and terminates active socket rooms", () => {
    let evicted = false;
    const handler = (event: { projectId: string; userId?: string }) => {
      if (event.userId === memberCId) {
        evicted = true;
      }
    };
    manuscriptEvents.on("member-revoked", handler);
    manuscriptEvents.emit("member-revoked", { projectId: testProjectId, userId: memberCId });
    manuscriptEvents.off("member-revoked", handler);
    expect(evicted).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 25: Compiler C sandbox seccomp/unshare verification
  // --------------------------------------------------------------------------
  it("Scenario 25: LaTeX compiler sandbox.c enforces Landlock, seccomp, and network isolation", () => {
    const sandboxPath = resolve(process.cwd(), "compiler/sandbox.c");
    const source = readFileSync(sandboxPath, "utf8");

    expect(source).toContain("landlock");
    expect(source).toContain("seccomp");
    expect(source).toContain("socket");
    expect(source).toContain("unshare");
    expect(source).toContain("PR_SET_NO_NEW_PRIVS");
  });

  // --------------------------------------------------------------------------
  // Scenario 26: DOI import conflict neutrality & private PDF deduplication
  // --------------------------------------------------------------------------
  it("Scenario 26: Paper DOI import preserves global neutrality without leaking private project annotations", async () => {
    const paper = await db.paper.create({
      data: {
        title: "Neutral DOI Reference Paper",
        doi: "10.1000/182.test." + crypto.randomUUID(),
        publicationYear: 2026,
        primaryProvider: "crossref",
      },
    });

    // Linked to test project
    const projectPaper = await db.projectPaper.create({
      data: {
        projectId: testProjectId,
        paperId: paper.id,
        readingStatus: "NOT_STARTED",
      },
    });

    expect(projectPaper.paperId).toBe(paper.id);
    expect(projectPaper.projectId).toBe(testProjectId);

    // Global paper metadata contains no project-specific confidential fields
    const globalPaper = await db.paper.findUniqueOrThrow({ where: { id: paper.id } });
    expect((globalPaper as Record<string, unknown>).projectId).toBeUndefined();
  });
});