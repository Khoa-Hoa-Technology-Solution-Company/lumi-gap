import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import {
  assertProjectHasPapers,
  canAccessProject,
  getProjectPaperIds,
  resolveProjectEvidenceIds,
} from "../project-scope.js";

describe("project-scope helpers", () => {
  it("normalizes paper ids from raw ids, ObjectIds, and populated paper refs", () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    const c = new mongoose.Types.ObjectId();

    expect(
      getProjectPaperIds({
        papers: [
          { targetId: a },
          { targetId: b.toString() },
          { targetId: { _id: c, title: "Populated" } },
        ],
      }),
    ).toEqual([a.toString(), b.toString(), c.toString()]);
  });

  it("checks access for primary owners and populated/raw member refs", () => {
    const ownerId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const populatedMemberId = new mongoose.Types.ObjectId();

    const project = {
      ownerId,
      members: [
        { targetId: memberId.toString() },
        { targetId: { _id: populatedMemberId, email: "member@test.local" } },
      ],
    };

    expect(canAccessProject(project, ownerId.toString())).toBe(true);
    expect(canAccessProject(project, memberId.toString())).toBe(true);
    expect(canAccessProject(project, populatedMemberId.toString())).toBe(true);
    expect(canAccessProject(project, new mongoose.Types.ObjectId().toString())).toBe(false);
  });

  it("uses all project papers when no explicit evidence ids are provided", () => {
    const paperIds = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];

    expect(resolveProjectEvidenceIds(paperIds, undefined)).toEqual({ ids: paperIds, invalidIds: [] });
    expect(resolveProjectEvidenceIds(paperIds, [])).toEqual({ ids: paperIds, invalidIds: [] });
  });

  it("rejects explicit evidence ids outside the project scope", () => {
    const paperIds = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];
    const outside = new mongoose.Types.ObjectId().toString();

    expect(resolveProjectEvidenceIds(paperIds, [paperIds[1]!, outside])).toEqual({
      ids: [paperIds[1]!],
      invalidIds: [outside],
    });
  });

  it("rejects project AI actions when the project has no papers", () => {
    expect(() => assertProjectHasPapers([], "project chat")).toThrow(
      /Add papers to this project before using project chat/,
    );
  });
});
