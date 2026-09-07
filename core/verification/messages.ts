/**
 * Stable uncertification messages shared between the verification runner
 * (which stamps them into run manifests) and lifecycle settlement (which
 * branches recovery behavior on them). They live in a dependency-free module
 * because verification.ts already imports verification-lifecycle.ts at
 * runtime; importing values back from verification.ts would create a cycle.
 */
export const MANUAL_STEP_SKIP_MESSAGE =
  "Manual steps cannot be certified by the verification runner.";

export const UNCERTIFIED_TRIPWIRE_MESSAGE =
  "Verification run uncertified because the diff touches verification/manifest code.";

export const UNCERTIFIED_COVERAGE_RATIONALE_MESSAGE =
  "Verification run uncertified because the demo includes a non-certifiable coverage rationale.";
