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
});
