import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerInstructionPrompts } from "./instructions.ts";

type PromptResponse = {
  description?: string;
  messages: Array<{
    role: "assistant" | "user";
    content: {
      type: "text";
      text: string;
    };
  }>;
};

type RegisteredPrompt = {
  name: string;
  description: string;
  callback: () => PromptResponse;
};

describe("registerInstructionPrompts", () => {
  it("registers all workflow and review prompts with text content", () => {
    const registeredPrompts: RegisteredPrompt[] = [];

    const server = {
      prompt(name: string, description: string, callback: () => PromptResponse): void {
        registeredPrompts.push({ name, description, callback });
      },
    } as unknown as McpServer;

    registerInstructionPrompts(server);

    expect(registeredPrompts.map((prompt) => prompt.name)).toEqual([
      "brain-dump-workflow",
      "code-review",
      "silent-failure-review",
      "code-simplifier-review",
    ]);

    for (const prompt of registeredPrompts) {
      const result = prompt.callback();
      expect(prompt.description.length).toBeGreaterThan(0);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content.type).toBe("text");
      expect(result.messages[0]?.content.text.length).toBeGreaterThan(40);
    }
  });
});
