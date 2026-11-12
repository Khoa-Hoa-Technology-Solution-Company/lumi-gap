import { beforeEach, expect, it, vi } from "vitest";
import { loadMentoredProjects } from "../hooks/use-mentored-projects";

const mocks = vi.hoisted(() => ({ mine: vi.fn() }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: mocks }));
const relationship = (projectId: string, override = {}) => ({ projectId, mentorUser: { _id: "mentor" }, status: "ACTIVE", actions: { openProject: true }, project: { title: projectId }, ...override });
beforeEach(() => vi.resetAllMocks());

it("loads all relationship pages, deduplicates projects and excludes other mentors or inaccessible relationships", async () => {
  mocks.mine.mockResolvedValueOnce({ relationships: [relationship("first"), relationship("other", { mentorUser: { _id: "another" } }), relationship("ended", { status: "ENDED" })], relationshipMeta: { totalPages: 2 } });
  mocks.mine.mockResolvedValueOnce({ relationships: [relationship("second"), relationship("first"), relationship("revoked", { actions: { openProject: false } }), relationship("missing", { project: undefined })], relationshipMeta: { totalPages: 2 } });
  expect((await loadMentoredProjects("mentor")).map(item => item.projectId)).toEqual(["first", "second"]);
  expect(mocks.mine).toHaveBeenNthCalledWith(2, { view: "active", page: 2, pageSize: 30 });
});

it("propagates failures without presenting a partial list as a successful empty directory", async () => {
  mocks.mine.mockRejectedValue(new Error("offline"));
  await expect(loadMentoredProjects("mentor")).rejects.toThrow("offline");
});
