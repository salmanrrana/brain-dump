import { describe, expect, it } from "vitest";
import { metadataStyles } from "./epic.$id";

describe("Epic detail workspace layout regression guards", () => {
  it("renders rail metadata as a quiet footnote, not another bordered card", () => {
    // After the workspace re-layout the epic's created metadata lives in the
    // sticky rail as a compact footer. Guard against it regressing back into a
    // heavy full card (bg + border + radius), which reintroduced the
    // identical-card monotony and broke parity with the ticket-detail page.
    expect(metadataStyles.border).toBeUndefined();
    expect(metadataStyles.background).toBeUndefined();
    expect(metadataStyles.borderRadius).toBeUndefined();
    expect(metadataStyles.borderTop).toBe("1px solid var(--border-primary)");
    expect(metadataStyles.flexDirection).toBe("column");
  });
});
