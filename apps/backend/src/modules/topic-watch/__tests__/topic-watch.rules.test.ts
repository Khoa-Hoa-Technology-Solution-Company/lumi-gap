import { describe, expect, it } from "vitest";
import {
  afterPage, daysBefore, fairShare, openWindow, pageBudget, pageRequest, restartQueries, settleBacklog, type WatchPosition,
} from "../topic-watch.rules.js";

const backlog: WatchPosition = {
  phase: "backlog",
  queryIndex: 0,
  cursor: null,
  backlogInserted: 0,
  backlogTargetPapers: 100,
  windowFrom: null,
  windowStartedOn: null,
  lastWindowCompletedOn: null,
};
const tracking: WatchPosition = { ...backlog, phase: "tracking" };
const page = { inserted: 0, nextCursor: "next", isEmpty: false, cutShort: false };

describe("fairShare", () => {
  it("splits what is left evenly and never returns less than one", () => {
    expect(fairShare(500, 4)).toBe(125);
    expect(fairShare(3, 5)).toBe(1);
    expect(fairShare(10, 0)).toBe(10);
  });
});

describe("daysBefore", () => {
  it("crosses month and year boundaries", () => {
    expect(daysBefore("2026-01-03", 7)).toBe("2025-12-27");
  });
});

describe("pageRequest", () => {
  it("reads older works by citations in the backlog, from the stored cursor", () => {
    expect(pageRequest({ ...backlog, cursor: "abc" }, ["q1"])).toEqual({
      filterExpression: "q1", sort: "cited_by_count:desc", cursor: "abc",
    });
  });

  it("starts a query from the first page when no cursor is stored", () => {
    expect(pageRequest(backlog, ["q1"]).cursor).toBe("*");
  });

  it("reads the window newest first when tracking", () => {
    expect(pageRequest({ ...tracking, windowFrom: "2026-11-01" }, ["q1"])).toEqual({
      filterExpression: "q1,from_publication_date:2026-11-01", sort: "publication_date:desc", cursor: "*",
    });
  });

  it("uses the query the position points at", () => {
    expect(pageRequest({ ...backlog, queryIndex: 1 }, ["q1", "q2"]).filterExpression).toBe("q2");
  });
});

describe("pageBudget", () => {
  it("stops the backlog at its target even when the day allows more", () => {
    expect(pageBudget({ ...backlog, backlogInserted: 90 }, 50)).toBe(10);
  });

  it("does not limit tracking by the backlog target", () => {
    expect(pageBudget({ ...tracking, backlogInserted: 100 }, 50)).toBe(50);
  });
});

describe("openWindow", () => {
  it("leaves a backlog position alone", () => {
    expect(openWindow(backlog, "2026-11-07", "2026-11-01", 7)).toEqual(backlog);
  });

  it("first window reaches back from the day the watch was created", () => {
    expect(openWindow(tracking, "2026-11-07", "2026-11-01", 7)).toMatchObject({
      windowFrom: "2026-10-25", windowStartedOn: "2026-11-07", cursor: null, queryIndex: 0,
    });
  });

  it("later windows overlap the last completed one so late-listed works are not missed", () => {
    expect(openWindow({ ...tracking, lastWindowCompletedOn: "2026-11-06" }, "2026-11-07", "2026-01-01", 7))
      .toMatchObject({ windowFrom: "2026-10-30" });
  });

  it("has nothing to read once caught up today", () => {
    expect(openWindow({ ...tracking, lastWindowCompletedOn: "2026-11-07" }, "2026-11-07", "2026-01-01", 7)).toBeNull();
  });

  it("keeps a window that is still open, with its cursor, so the next day continues it", () => {
    const open = { ...tracking, windowFrom: "2026-11-01", windowStartedOn: "2026-11-06", cursor: "abc" };
    expect(openWindow(open, "2026-11-07", "2026-01-01", 7)).toEqual(open);
  });
});

describe("afterPage", () => {
  it("stores the next cursor, so tomorrow does not start again from the first page", () => {
    expect(afterPage(backlog, { ...page, inserted: 5 }, 1)).toMatchObject({ cursor: "next", backlogInserted: 5, phase: "backlog" });
  });

  it("keeps the cursor when the budget left out part of the page", () => {
    expect(afterPage({ ...backlog, cursor: "here" }, { ...page, inserted: 5, cutShort: true }, 1))
      .toMatchObject({ cursor: "here", backlogInserted: 5 });
  });

  it("moves to the next query when one runs out", () => {
    expect(afterPage({ ...backlog, cursor: "x" }, { ...page, nextCursor: null }, 2)).toMatchObject({ queryIndex: 1, cursor: null, phase: "backlog" });
  });

  it("moves on to tracking when the backlog read everything", () => {
    expect(afterPage(backlog, { ...page, nextCursor: null }, 1)).toMatchObject({ phase: "tracking", queryIndex: 0, cursor: null });
  });

  it("treats an empty page as the end even when OpenAlex sends a cursor", () => {
    expect(afterPage(backlog, { ...page, isEmpty: true }, 1)).toMatchObject({ phase: "tracking" });
  });

  it("moves on to tracking when the backlog reaches its target", () => {
    expect(afterPage({ ...backlog, backlogInserted: 95, cursor: "x" }, { ...page, inserted: 5, cutShort: true }, 1))
      .toMatchObject({ phase: "tracking", cursor: null, backlogInserted: 100 });
  });

  it("records the day a window was opened as caught up, not the day it finished", () => {
    const open = { ...tracking, windowFrom: "2026-11-01", windowStartedOn: "2026-11-06", cursor: "abc" };
    expect(afterPage(open, { ...page, nextCursor: null }, 1)).toEqual({
      ...tracking, lastWindowCompletedOn: "2026-11-06", windowFrom: null, windowStartedOn: null, cursor: null,
    });
  });

  it("does not count tracking inserts against the backlog", () => {
    const open = { ...tracking, windowFrom: "2026-11-01", windowStartedOn: "2026-11-06" };
    expect(afterPage(open, { ...page, inserted: 9 }, 1).backlogInserted).toBe(0);
  });
});

describe("settleBacklog", () => {
  it("skips the backlog for a target of 0", () => {
    expect(settleBacklog({ ...backlog, backlogTargetPapers: 0 }).phase).toBe("tracking");
  });

  it("leaves an unfinished backlog alone", () => {
    expect(settleBacklog({ ...backlog, cursor: "x", backlogInserted: 5 })).toMatchObject({ phase: "backlog", cursor: "x" });
  });
});

describe("restartQueries", () => {
  it("drops the cursor and the window but keeps the counts", () => {
    expect(restartQueries({ ...tracking, queryIndex: 2, cursor: "x", windowFrom: "2026-11-01", windowStartedOn: "2026-11-06", backlogInserted: 7 }))
      .toEqual({ ...tracking, backlogInserted: 7 });
  });
});
