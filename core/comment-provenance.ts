import { ValidationError } from "./errors.ts";
import type { CommentActorKind, CommentPhase, CommentProvenance } from "./types.ts";

export const COMMENT_PHASE_LABELS: Record<CommentPhase, string> = {
  implementation: "Implementation",
  ai_review: "AI Review",
  demo: "Demo",
  ai_verification: "AI Verification",
  repair: "Repair",
  system_workflow: "System Workflow",
};

export const COMMENT_ACTOR_KIND_LABELS: Record<CommentActorKind, string> = {
  ai: "AI",
  system: "System",
};

export type CommentProvenanceInput = Partial<CommentProvenance>;

export function resolveCommentProvenance(
  provenance: CommentProvenanceInput = {}
): CommentProvenance {
  if (provenance.phase && !Object.hasOwn(COMMENT_PHASE_LABELS, provenance.phase)) {
    throw new ValidationError(`Unknown comment phase: ${provenance.phase}.`, {
      phase: "Use a supported workflow phase.",
    });
  }
  if (provenance.actorKind && !Object.hasOwn(COMMENT_ACTOR_KIND_LABELS, provenance.actorKind)) {
    throw new ValidationError(`Unknown comment actor kind: ${provenance.actorKind}.`, {
      actorKind: "Use 'ai' or 'system'.",
    });
  }

  const resolved: CommentProvenance = {
    phase: provenance.phase ?? null,
    actorKind: provenance.actorKind ?? null,
    provider: provenance.provider?.trim() || null,
    modelProvider: provenance.modelProvider?.trim() || null,
    modelName: provenance.modelName?.trim() || null,
  };

  if (resolved.actorKind === "system" && (resolved.modelProvider || resolved.modelName)) {
    throw new ValidationError("System comment provenance cannot include model attribution.", {
      actorKind: "System actors cannot claim model provider or model name data.",
    });
  }

  return resolved;
}
