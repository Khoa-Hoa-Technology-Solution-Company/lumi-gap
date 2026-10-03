import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForumAuthorPopover } from "../components/forum-author-popover";
import { ForumAuthorAvatar } from "../components/forum-author-avatar";
import { ForumReactionPicker } from "../components/forum-reaction-picker";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));

describe("Forum author preview", () => {
  it("makes every forum avatar an accessible hovercard trigger that links to the profile", () => {
    const markup = renderToStaticMarkup(
      <ForumAuthorPopover author={{ id: "researcher-1", fullName: "A. Researcher", primaryPosition: "LECTURER" }}>
        <ForumAuthorAvatar author={{ id: "researcher-1", fullName: "A. Researcher" }} size="md" />
      </ForumAuthorPopover>,
    );

    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="View author profile"');
    expect(markup).toContain('href="/academics/researcher-1"');
    expect(markup).toContain('aria-label="A. Researcher"');
  });

  it("keeps reaction counts and reactor names discoverable without making them evidence", () => {
    const markup = renderToStaticMarkup(
      <ForumReactionPicker
        counts={{ LIKE: 6, INSIGHTFUL: 0, CELEBRATE: 0, CURIOUS: 0, LOVE: 0, LAUGH: 0, SURPRISED: 0, SAD: 0, AGREE: 0, DISAGREE: 0 }}
        reactionUsers={{ LIKE: [{ id: "researcher-1", fullName: "A. Researcher" }, { id: "researcher-2", fullName: "B. Researcher" }] }}
        isAuthed={false}
        onToggle={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Like 6. Who reacted"');
    expect(markup).toContain("A. Researcher, B. Researcher +4");
    expect(markup).not.toContain("scientific evidence");
  });
});
