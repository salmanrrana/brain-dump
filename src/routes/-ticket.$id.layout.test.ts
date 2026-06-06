import { describe, expect, it } from "vitest";
import { activitySectionStyles, metadataStyles } from "./ticket.$id";

describe("Ticket detail workspace layout regression guards", () => {
  it("keeps the activity log in normal flow as primary reading (not a fixed/sticky widget)", () => {
    expect(activitySectionStyles.flex).toBe("0 0 auto");
    expect(activitySectionStyles.position).toBeUndefined();
  });

  it("renders rail metadata as a quiet footnote, not another bordered card", () => {
    // After the workspace re-layout the created/updated/completed metadata lives
    // in the sticky rail as a compact footer. Guard against it regressing back
    // into a heavy full card (which reintroduced the identical-card monotony).
    expect(metadataStyles.border).toBeUndefined();
    expect(metadataStyles.background).toBeUndefined();
    expect(metadataStyles.borderTop).toBe("1px solid var(--border-primary)");
    expect(metadataStyles.flexDirection).toBe("column");
  });

  it("keeps rail metadata timestamps above the 4.5:1 contrast bar", () => {
    // These timestamps are content, not incidental chrome, so they must use
    // --text-secondary (≈6.7:1 on the page surface), not the much fainter
    // --text-muted (≈2.2:1) which fails WCAG AA for content text.
    expect(metadataStyles.color).toBe("var(--text-secondary)");
  });
});
