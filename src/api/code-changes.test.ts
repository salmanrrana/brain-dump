import { describe, expect, it } from "vitest";
import { validateCodeChangePatchInputForApi, validateCodeChangeScopeForApi } from "./code-changes";

describe("code changes API validators", () => {
  it("accepts ticket and epic scopes without trusting project paths from clients", () => {
    expect(validateCodeChangeScopeForApi({ type: "ticket", id: "ticket-1" })).toEqual({
      type: "ticket",
      id: "ticket-1",
    });
    expect(
      validateCodeChangePatchInputForApi({
        scope: { type: "epic", id: "epic-1" },
        ticketId: "ticket-1",
        sourceId: "ticket:ticket-1:commit:abcdef1",
        filePath: "src/file.ts",
        projectPath: "/untrusted/client/path",
      })
    ).toEqual({
      scope: { type: "epic", id: "epic-1" },
      ticketId: "ticket-1",
      sourceId: "ticket:ticket-1:commit:abcdef1",
      filePath: "src/file.ts",
    });
  });

  it("rejects malformed patch selections before they reach the core layer", () => {
    expect(() => validateCodeChangeScopeForApi({ type: "project", id: "proj-1" })).toThrow(
      "scope must include type 'ticket' or 'epic' and a string id"
    );
    expect(() =>
      validateCodeChangePatchInputForApi({
        scope: { type: "ticket", id: "ticket-1" },
        sourceId: 42,
      })
    ).toThrow("sourceId must be a string");
  });
});
