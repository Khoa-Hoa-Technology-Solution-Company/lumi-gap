import { beforeEach, expect, it, vi } from "vitest";
import { selectCaseCandidate } from "../screening-case-selection.js";

const draw = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", () => ({ randomInt: draw }));
beforeEach(() => draw.mockReset());

it("does not manufacture an assignee for an empty eligibility pool", () => {
  expect(selectCaseCandidate([])).toBeNull();
  expect(draw).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("can select candidate %s using the complete eligible tier", index => {
  draw.mockReturnValue(index);
  const pool = [{ id: "member-a" }, { id: "member-b" }, { id: "owner" }];
  expect(selectCaseCandidate(pool)).toBe(pool[index]);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(draw).toHaveBeenCalledWith(3);
});
