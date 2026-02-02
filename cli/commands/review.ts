/**
 * Review commands: submit-finding, mark-fixed, check-complete, generate-demo, get-demo, submit-feedback, get-findings.
 */

import { readFileSync } from "fs";
import {
  submitFinding,
  markFixed,
  checkComplete,
  generateDemo,
  getDemo,
  submitFeedback,
  getFindings,
  InvalidActionError,
  ValidationError,
} from "../../core/index.ts";
import type {
  FindingSeverity,
  FindingAgent,
  FindingStatus,
  MarkFixedStatus,
  DemoStep,
} from "../../core/index.ts";
import {
  parseFlags,
  requireFlag,
  optionalFlag,
  boolFlag,
  numericFlag,
  requireEnumFlag,
  optionalEnumFlag,
} from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = [
  "submit-finding",
  "mark-fixed",
  "check-complete",
  "generate-demo",
  "get-demo",
  "submit-feedback",
  "get-findings",
];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "review",
      ACTIONS,
      "Flags:\n  --ticket <id>         Ticket ID\n  --finding <id>        Finding ID\n  --severity <s>        critical|major|minor|suggestion\n  --agent <a>           code-reviewer|silent-failure-hunter|code-simplifier\n  --category <c>        Category of finding\n  --description <d>     Detailed description\n  --status <s>          fixed|wont_fix|duplicate\n  --file <path>         File path\n  --line <n>            Line number\n  --fix <text>          Suggested fix\n  --steps-file <path>   JSON file with demo steps\n  --passed              Demo passed\n  --feedback <text>     Demo feedback\n  --pretty              Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "submit-finding": {
        const ticketId = requireFlag(flags, "ticket");
        const severity = requireEnumFlag<FindingSeverity>(flags, "severity", [
          "critical",
          "major",
          "minor",
          "suggestion",
        ]);
        const agent = requireEnumFlag<FindingAgent>(flags, "agent", [
          "code-reviewer",
          "silent-failure-hunter",
          "code-simplifier",
        ]);
        const category = requireFlag(flags, "category");
        const description = requireFlag(flags, "description");
        const filePath = optionalFlag(flags, "file");
        const lineNumber = numericFlag(flags, "line");
        const suggestedFix = optionalFlag(flags, "fix");

        const result = submitFinding(db, {
          ticketId,
          severity,
          agent,
          category,
          description,
          ...(filePath !== undefined ? { filePath } : {}),
          ...(lineNumber !== undefined ? { lineNumber } : {}),
          ...(suggestedFix !== undefined ? { suggestedFix } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "mark-fixed": {
        const findingId = requireFlag(flags, "finding");
        const status = requireEnumFlag<MarkFixedStatus>(flags, "status", [
          "fixed",
          "wont_fix",
          "duplicate",
        ]);
        const result = markFixed(db, findingId, status);
        outputResult(result, pretty);
        break;
      }

      case "check-complete": {
        const ticketId = requireFlag(flags, "ticket");
        const result = checkComplete(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "generate-demo": {
        const ticketId = requireFlag(flags, "ticket");
        const stepsFile = requireFlag(flags, "steps-file");
        let steps: DemoStep[];
        try {
          const stepsJson = readFileSync(stepsFile, "utf-8");
          steps = JSON.parse(stepsJson) as DemoStep[];
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new ValidationError(`Failed to read steps file "${stepsFile}": ${msg}`);
        }
        const result = generateDemo(db, { ticketId, steps });
        outputResult(result, pretty);
        break;
      }

      case "get-demo": {
        const ticketId = requireFlag(flags, "ticket");
        const result = getDemo(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "submit-feedback": {
        const ticketId = requireFlag(flags, "ticket");
        const passed = boolFlag(flags, "passed");
        const feedback = optionalFlag(flags, "feedback") ?? "";
        const result = submitFeedback(db, { ticketId, passed, feedback });
        outputResult(result, pretty);
        break;
      }

      case "get-findings": {
        const ticketId = requireFlag(flags, "ticket");
        const status = optionalEnumFlag<FindingStatus>(flags, "status", [
          "open",
          "fixed",
          "wont_fix",
          "duplicate",
        ]);
        const severity = optionalEnumFlag<FindingSeverity>(flags, "severity", [
          "critical",
          "major",
          "minor",
          "suggestion",
        ]);
        const agent = optionalEnumFlag<FindingAgent>(flags, "agent", [
          "code-reviewer",
          "silent-failure-hunter",
          "code-simplifier",
        ]);
        const result = getFindings(db, ticketId, {
          ...(status !== undefined ? { status } : {}),
          ...(severity !== undefined ? { severity } : {}),
          ...(agent !== undefined ? { agent } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("review", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
