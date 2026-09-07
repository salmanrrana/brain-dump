import { ValidationError } from "../errors.ts";

/** Resolve explicit paths, the original documented object form, and legacy path=value strings. */
export function resolveApiJsonAssertion(assertion: { path?: unknown; expected: unknown }): {
  path: string;
  expected: unknown;
} {
  let path = assertion.path;
  let expected = assertion.expected;
  if (
    path === undefined &&
    typeof expected === "object" &&
    expected !== null &&
    "path" in expected &&
    "value" in expected
  ) {
    path = expected.path;
    expected = expected.value;
  } else if (path === undefined && typeof expected === "string" && expected.includes("=")) {
    const separator = expected.indexOf("=");
    path = expected.slice(0, separator);
    expected = expected.slice(separator + 1);
  }
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new ValidationError(
      "API jsonPath assertions require a non-empty path and expected data (legacy expected: { path, value } or 'path=value' is also supported)."
    );
  }
  if (expected === undefined) {
    throw new ValidationError("API jsonPath assertions require expected data.");
  }
  return { path, expected };
}
