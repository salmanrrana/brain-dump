import { describe, expect, it } from "vitest";
import {
  applyCodeChangeRouteSearch,
  applyCodeChangeSearchToObject,
  parseCodeChangeRouteSearch,
  serializeCodeChangeRouteSearch,
} from "./code-change-route-search";

describe("code-change route search helpers", () => {
  it("parses open state, selected ticket/source/file, wrapping, and whitespace flags", () => {
    const state = parseCodeChangeRouteSearch(
      "codeChanges=1&changeTicket=ticket-1&changeSource=source-1&changeFile=src%2Ffile.ts&diffWrap=0&diffWhitespace=ignore"
    );

    expect(state).toEqual({
      open: true,
      selectedTicketId: "ticket-1",
      selectedSourceId: "source-1",
      selectedFilePath: "src/file.ts",
      wordWrap: false,
      ignoreWhitespace: true,
    });
  });

  it("serializes and clears only code-change search params", () => {
    const serialized = serializeCodeChangeRouteSearch({
      open: true,
      selectedTicketId: "ticket-1",
      selectedSourceId: "source-1",
      selectedFilePath: "src/file.ts",
      wordWrap: true,
      ignoreWhitespace: false,
    });

    expect(parseCodeChangeRouteSearch(serialized)).toMatchObject({
      open: true,
      selectedTicketId: "ticket-1",
      selectedSourceId: "source-1",
      selectedFilePath: "src/file.ts",
    });

    const cleared = applyCodeChangeRouteSearch(
      "tab=details&codeChanges=1&changeFile=src%2Ffile.ts",
      {
        open: false,
      }
    );

    expect(cleared.toString()).toBe("tab=details");
  });

  it("applies a patch to a plain object and preserves unrelated params (TanStack navigate shape)", () => {
    const next = applyCodeChangeSearchToObject(
      { tab: "details" },
      {
        open: true,
        selectedSourceId: "ticket:ticket-1:commit:abc123",
        selectedFilePath: "src/file.ts",
      }
    );

    expect(next).toMatchObject({
      tab: "details",
      codeChanges: "1",
      changeSource: "ticket:ticket-1:commit:abc123",
      changeFile: "src/file.ts",
    });
  });

  it("clears code-change params on close while keeping unrelated params", () => {
    const next = applyCodeChangeSearchToObject(
      { tab: "details", codeChanges: "1", changeFile: "src/file.ts" },
      { open: false }
    );

    expect(next).toEqual({ tab: "details" });
  });

  it("preserves selection params when only display preferences change", () => {
    const next = applyCodeChangeSearchToObject(
      {
        tab: "details",
        codeChanges: "1",
        changeTicket: "ticket-1",
        changeSource: "source-1",
        changeFile: "src/file.ts",
      },
      { wordWrap: false }
    );

    expect(next).toMatchObject({
      tab: "details",
      codeChanges: "1",
      changeTicket: "ticket-1",
      changeSource: "source-1",
      changeFile: "src/file.ts",
      diffWrap: "0",
    });
  });
});
