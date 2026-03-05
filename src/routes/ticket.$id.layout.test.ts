import { describe, expect, it } from "vitest";
import { activitySectionStyles, metadataStyles } from "./ticket.$id";

describe("Ticket detail Activity layout regression guards", () => {
  it("keeps activity section in normal flow so metadata divider stays below content", () => {
    expect(activitySectionStyles.flex).toBe("0 0 auto");
  });

  it("renders metadata as a regular footer with a top divider", () => {
    expect(metadataStyles.borderTop).toBe("1px solid var(--border-primary)");
    expect(metadataStyles.padding).toBe("var(--spacing-4)");
    expect(metadataStyles.display).toBe("flex");
    expect(metadataStyles.position).toBeUndefined();
  });
});
