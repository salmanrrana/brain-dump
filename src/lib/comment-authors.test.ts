import { describe, expect, it } from "vitest";
import {
  getCommentAuthorBase,
  getCommentAuthorDisplayName,
  getCommentAuthorStyle,
  isValidCommentAuthor,
} from "./comment-authors";

describe("comment author helpers", () => {
  it("treats supported provider authors as valid", () => {
    expect(isValidCommentAuthor("codex")).toBe(true);
    expect(isValidCommentAuthor("cursor")).toBe(true);
    expect(isValidCommentAuthor("vscode")).toBe(true);
    expect(isValidCommentAuthor("copilot")).toBe(true);
    expect(isValidCommentAuthor("pi")).toBe(true);
    expect(isValidCommentAuthor("brain-dump")).toBe(true);
  });

  it("treats Ralph provider-prefixed authors as valid", () => {
    expect(isValidCommentAuthor("ralph:codex")).toBe(true);
    expect(isValidCommentAuthor("ralph:pi")).toBe(true);
    expect(isValidCommentAuthor("ralph:cursor")).toBe(true);
  });

  it("formats direct provider display names for users", () => {
    expect(getCommentAuthorDisplayName("codex")).toBe("Codex");
    expect(getCommentAuthorDisplayName("pi")).toBe("Pi");
    expect(getCommentAuthorDisplayName("vscode")).toBe("VS Code");
    expect(getCommentAuthorDisplayName("brain-dump")).toBe("Brain Dump");
  });

  it("formats Ralph provider-prefixed authors clearly", () => {
    expect(getCommentAuthorDisplayName("ralph:codex")).toBe("Ralph (Codex)");
    expect(getCommentAuthorDisplayName("ralph:pi")).toBe("Ralph (Pi)");
    expect(getCommentAuthorBase("ralph:codex")).toBe("ralph");
  });

  it("returns provider-specific styles for supported authors", () => {
    expect(getCommentAuthorStyle("codex").display).toBe("CX");
    expect(getCommentAuthorStyle("pi").display).toBe("PI");
    expect(getCommentAuthorStyle("copilot").display).toBe("GH");
  });
});
