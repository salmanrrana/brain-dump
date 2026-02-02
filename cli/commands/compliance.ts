/**
 * Compliance / conversation logging commands: start, log, end, list, export, archive.
 */

import {
  startConversation,
  logMessage,
  endConversation,
  listConversations,
  exportComplianceLogs,
  archiveOldSessions,
  InvalidActionError,
} from "../../core/index.ts";
import type { ComplianceDependencies, DataClassification, MessageRole } from "../../core/index.ts";
import {
  parseFlags,
  requireFlag,
  optionalFlag,
  boolFlag,
  numericFlag,
  optionalEnumFlag,
  requireEnumFlag,
} from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["start", "log", "end", "list", "export", "archive"];

/** Basic secret detection patterns for CLI-logged messages. */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*\S+/i,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(?:bearer|authorization)\s+\S+/i,
  /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*\S+/i,
  /ghp_[A-Za-z0-9_]{36,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

function containsSecrets(content: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(content));
}

const cliDeps: ComplianceDependencies = {
  detectEnvironment: () => "cli",
  containsSecrets,
};

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "compliance",
      ACTIONS,
      "Flags:\n  --session <id>            Session ID\n  --project <id>            Project ID\n  --ticket <id>             Ticket ID\n  --user <id>               User ID\n  --classification <c>      public|internal|confidential|restricted\n  --role <role>             user|assistant|system|tool\n  --content <text>          Message content\n  --model <id>              Model ID\n  --env <env>               Environment filter\n  --start <date>            Start date (ISO)\n  --end <date>              End date (ISO)\n  --start-date <date>       Start date for export (ISO)\n  --end-date <date>         End date for export (ISO)\n  --days <n>                Retention days for archive\n  --confirm                 Confirm archive\n  --limit <n>               Max results\n  --pretty                  Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "start": {
        const projectId = optionalFlag(flags, "project");
        const ticketId = optionalFlag(flags, "ticket");
        const userId = optionalFlag(flags, "user");
        const dataClassification = optionalEnumFlag<DataClassification>(flags, "classification", [
          "public",
          "internal",
          "confidential",
          "restricted",
        ]);

        const result = startConversation(
          db,
          {
            ...(projectId !== undefined ? { projectId } : {}),
            ...(ticketId !== undefined ? { ticketId } : {}),
            ...(userId !== undefined ? { userId } : {}),
            ...(dataClassification !== undefined ? { dataClassification } : {}),
          },
          cliDeps
        );
        outputResult(result, pretty);
        break;
      }

      case "log": {
        const sessionId = requireFlag(flags, "session");
        const role = requireEnumFlag<MessageRole>(flags, "role", [
          "user",
          "assistant",
          "system",
          "tool",
        ]);
        const content = requireFlag(flags, "content");
        const modelId = optionalFlag(flags, "model");

        const result = logMessage(
          db,
          {
            sessionId,
            role,
            content,
            ...(modelId !== undefined ? { modelId } : {}),
          },
          cliDeps
        );
        outputResult(result, pretty);
        break;
      }

      case "end": {
        const sessionId = requireFlag(flags, "session");
        const result = endConversation(db, sessionId);
        outputResult(result, pretty);
        break;
      }

      case "list": {
        const projectId = optionalFlag(flags, "project");
        const ticketId = optionalFlag(flags, "ticket");
        const environment = optionalFlag(flags, "env");
        const startDate = optionalFlag(flags, "start");
        const endDate = optionalFlag(flags, "end");
        const limit = numericFlag(flags, "limit");
        const result = listConversations(db, {
          ...(projectId !== undefined ? { projectId } : {}),
          ...(ticketId !== undefined ? { ticketId } : {}),
          ...(environment !== undefined ? { environment } : {}),
          ...(startDate !== undefined ? { startDate } : {}),
          ...(endDate !== undefined ? { endDate } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "export": {
        const startDate = requireFlag(flags, "start-date");
        const endDate = requireFlag(flags, "end-date");
        const sessionId = optionalFlag(flags, "session");
        const projectId = optionalFlag(flags, "project");

        const result = exportComplianceLogs(db, {
          startDate,
          endDate,
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "archive": {
        const retentionDays = numericFlag(flags, "days");
        const confirm = boolFlag(flags, "confirm");
        const result = archiveOldSessions(db, {
          ...(retentionDays !== undefined ? { retentionDays } : {}),
          ...(confirm ? { confirm } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("compliance", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
