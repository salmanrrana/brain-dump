/**
 * Review commands: submit-finding, mark-fixed, check-complete, generate-demo, get-demo, get-findings,
 * get-verification-history, repair-legacy-handoff.
 */

import { readFileSync } from "fs";
import {
  submitFinding,
  markFixed,
  checkComplete,
  validateGenerateDemo,
  generateDemo,
  getDemo,
  getFindings,
  listVerificationRuns,
  repairLegacyHumanReviewHandoff,
  updatePrdForDbTicketIfPresent,
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
  "get-findings",
  "get-verification-history",
  "repair-legacy-handoff",
];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("review");
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
        const demoParams = { ticketId, steps };
        validateGenerateDemo(db, demoParams);
        const prdSync = updatePrdForDbTicketIfPresent(db, ticketId, false);
        if (prdSync.required && !prdSync.success) {
          throw new ValidationError(
            `Cannot generate demo because PRD sync failed: ${prdSync.message}`
          );
        }
        const result = generateDemo(db, demoParams);
        outputResult({ ...result, prdSync }, pretty);
        break;
      }

      case "get-demo": {
        const ticketId = requireFlag(flags, "ticket");
        const result = getDemo(db, ticketId);
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

      case "get-verification-history": {
        const ticketId = requireFlag(flags, "ticket");
        const result = listVerificationRuns(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "repair-legacy-handoff": {
        const ticketId = requireFlag(flags, "ticket");
        const prdSync = updatePrdForDbTicketIfPresent(db, ticketId, false);
        if (prdSync.required && !prdSync.success) {
          throw new ValidationError(
            `Cannot repair legacy handoff because PRD sync failed: ${prdSync.message}`
          );
        }
        const result = repairLegacyHumanReviewHandoff(db, ticketId);
        outputResult({ ...result, prdSync }, pretty);
        break;
      }

      default:
        throw new InvalidActionError("review", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
