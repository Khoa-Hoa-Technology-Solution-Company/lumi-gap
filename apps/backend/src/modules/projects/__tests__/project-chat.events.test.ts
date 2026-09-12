import { describe, expect, it } from "vitest";
import { ProjectChatEventHub } from "../project-chat.events.js";

describe("ProjectChatEventHub", () => {
  it("publishes project AI chat events only to matching project subscribers", () => {
    const hub = new ProjectChatEventHub();
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    hub.subscribe("project-a", (event) => receivedA.push(event));
    hub.subscribe("project-b", (event) => receivedB.push(event));

    hub.publish({
      type: "message.created",
      projectId: "project-a",
      scope: "team",
      occurredAt: "2026-07-16T00:00:00.000Z",
    });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(0);
  });

  it("unsubscribes listeners cleanly", () => {
    const hub = new ProjectChatEventHub();
    const received: unknown[] = [];
    const unsubscribe = hub.subscribe("project-a", (event) => received.push(event));
    unsubscribe();

    hub.publish({
      type: "message.updated",
      projectId: "project-a",
      scope: "team",
      occurredAt: "2026-07-16T00:00:00.000Z",
    });

    expect(received).toEqual([]);
  });
});
