import { describe, expect, it, vi } from "vitest";
import { ProjectTeamChatEventHub } from "../project-team-chat.events.js";

describe("ProjectTeamChatEventHub", () => {
  it("publishes events only to subscribers of the same project", () => {
    const hub = new ProjectTeamChatEventHub();
    const projectA = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const projectB = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    hub.subscribe(projectA, listenerA);
    hub.subscribe(projectB, listenerB);
    hub.publish({
      type: "message.created",
      projectId: projectA,
      message: { id: "m1" } as any,
      occurredAt: "2026-07-16T06:00:00.000Z",
    });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("stops publishing after unsubscribe", () => {
    const hub = new ProjectTeamChatEventHub();
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const listener = vi.fn();

    const unsubscribe = hub.subscribe(projectId, listener);
    unsubscribe();
    hub.publish({
      type: "message.deleted",
      projectId,
      message: { id: "m1" } as any,
      occurredAt: "2026-07-16T06:00:00.000Z",
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
