import { createServerFn } from "@tanstack/react-start";
import {
  defaultCodeChangeDeps,
  getCodeChangePatch,
  getCodeChangeSummary,
} from "../../core/code-changes.ts";
import type {
  CodeChangePatchResult,
  CodeChangeScope,
  CodeChangeSummaryResult,
} from "../../core/code-changes.ts";
import { sqlite } from "../lib/db";

export function validateCodeChangeScopeForApi(input: unknown): CodeChangeScope {
  if (!input || typeof input !== "object") {
    throw new Error("scope is required");
  }

  const scope = input as { type?: unknown; id?: unknown };
  if ((scope.type !== "ticket" && scope.type !== "epic") || typeof scope.id !== "string") {
    throw new Error("scope must include type 'ticket' or 'epic' and a string id");
  }

  return {
    type: scope.type,
    id: scope.id,
  };
}

function validateOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  return value;
}

export const getCodeChangeSummaryServerFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown): CodeChangeScope => validateCodeChangeScopeForApi(input))
  .handler(async ({ data }): Promise<CodeChangeSummaryResult> => {
    return await getCodeChangeSummary(data, {
      db: sqlite,
      ...defaultCodeChangeDeps,
    });
  });

export interface CodeChangePatchServerInput {
  scope: CodeChangeScope;
  ticketId?: string;
  sourceId?: string;
  filePath?: string;
  ignoreWhitespace?: boolean;
}

export function validateCodeChangePatchInputForApi(input: unknown): CodeChangePatchServerInput {
  if (!input || typeof input !== "object") {
    throw new Error("patch input is required");
  }

  const data = input as Record<string, unknown>;
  const ticketId = validateOptionalString(data.ticketId, "ticketId");
  const sourceId = validateOptionalString(data.sourceId, "sourceId");
  const filePath = validateOptionalString(data.filePath, "filePath");

  return {
    scope: validateCodeChangeScopeForApi(data.scope),
    ...(ticketId ? { ticketId } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(filePath ? { filePath } : {}),
    ...(data.ignoreWhitespace === true ? { ignoreWhitespace: true } : {}),
  };
}

export const getCodeChangePatchServerFn = createServerFn({ method: "GET" })
  .inputValidator(validateCodeChangePatchInputForApi)
  .handler(async ({ data }): Promise<CodeChangePatchResult> => {
    return await getCodeChangePatch(data, {
      db: sqlite,
      ...defaultCodeChangeDeps,
    });
  });
