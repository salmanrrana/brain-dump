/**
 * Review commands: get-review-context, submit-finding, mark-fixed, check-complete, generate-demo,
 * get-demo, get-findings, get-verification-history, repair-legacy-handoff,
 * resolve-verification-failure.
 */

import { readFileSync } from "fs";
import {
  submitFinding,
  markFixed,
  checkComplete,
  getReviewContext,
  validateGenerateDemo,
  generateDemo,
  getDemo,
  getFindings,
  validateRepairLegacyHumanReviewHandoff,
  repairLegacyHumanReviewHandoff,
} from "../../core/review.ts";
import { listVerificationRuns } from "../../core/verification/run.ts";
import {
  resolveBrainDumpRootFrom,
  spawnDetachedVerificationDrain,
} from "../../core/verification/worker.ts";
import { resolveVerificationFailure } from "../../core/verification/ops.ts";
import { updatePrdForDbTicketIfPresent } from "../../core/prd-sync.ts";
import { resolveCommentAuthor } from "../../core/comment.ts";
import { InvalidActionError, ValidationError } from "../../core/errors.ts";
import type {
  FindingSeverity,
  FindingAgent,
  FindingStatus,
  MarkFixedStatus,
  DemoStep,
  VerificationFailureResolutionClassification,
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
  "get-review-context",
  "submit-finding",
  "mark-fixed",
  "check-complete",
  "generate-demo",
  "get-demo",
  "get-findings",
  "get-verification-history",
  "repair-legacy-handoff",
  "resolve-verification-failure",
];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("review");
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();
  const callerAuthor = resolveCommentAuthor(
    process.env.BRAIN_DUMP_PROVIDER ?? "",
    process.env.RALPH_SESSION === "1"
  );
  // Dedicated reviewer launches supply their own identity. Otherwise this
  // process is the reviewer, just as it is for CLI implementation comments.
  const commentIdentity = process.env.BRAIN_DUMP_REVIEWER_AUTHOR?.trim()
    ? {}
    : { author: callerAuthor };

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
          commentIdentity,
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
        const result = markFixed(db, findingId, status, { commentIdentity });
        outputResult(result, pretty);
        break;
      }

      case "check-complete": {
        const ticketId = requireFlag(flags, "ticket");
        const result = checkComplete(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "get-review-context": {
        const ticketId = requireFlag(flags, "ticket");
        const result = getReviewContext(db, ticketId);
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
        const demoParams = { ticketId, steps, commentIdentity };
        validateGenerateDemo(db, demoParams);
        const prdSync = updatePrdForDbTicketIfPresent(db, ticketId, false, "ai_verification");
        if (prdSync.required && !prdSync.success) {
          throw new ValidationError(
            `Cannot generate demo because PRD sync failed: ${prdSync.message}`
          );
        }
        const result = generateDemo(db, demoParams);
        // The handoff enqueued a verification job; hand execution to a
        // detached one-shot drain so it runs current on-disk code and this
        // command returns immediately.
        const brainDumpRoot = resolveBrainDumpRootFrom(import.meta.url);
        const drain = brainDumpRoot
          ? spawnDetachedVerificationDrain({
              brainDumpRoot,
              logError: (message) => console.error(`[verify-drain] ${message}`),
            })
          : { spawned: false as const, error: "Brain Dump root not resolvable" };
        if (!drain.spawned) {
          console.error(
            `[verify-drain] Drain not spawned (${drain.error ?? "unknown"}); job stays queued for the next boot or enqueue drain.`
          );
        }
        outputResult({ ...result, prdSync, verificationDrain: drain }, pretty);
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
        validateRepairLegacyHumanReviewHandoff(db, ticketId);
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

      case "resolve-verification-failure": {
        const ticketId = requireFlag(flags, "ticket");
        const rootCause = requireFlag(flags, "root-cause");
        const classification = requireEnumFlag<VerificationFailureResolutionClassification>(
          flags,
          "classification",
          ["connectivity", "environment", "demo-spec", "product-defect", "other"]
        );
        const validation = requireFlag(flags, "validation");
        const fixCommitsValue = optionalFlag(flags, "fix-commits");
        const whyNextAttemptWillPass = optionalFlag(flags, "why-next-attempt-will-pass");
        const operator = optionalFlag(flags, "operator");
        const result = resolveVerificationFailure(db, {
          ticketId,
          rootCause,
          classification,
          validation,
          commentIdentity: { author: callerAuthor },
          ...(fixCommitsValue
            ? { fixCommits: fixCommitsValue.split(",").map((value) => value.trim()) }
            : {}),
          ...(whyNextAttemptWillPass ? { whyNextAttemptWillPass } : {}),
          ...(operator ? { operator } : {}),
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
