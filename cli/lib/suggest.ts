/**
 * Fuzzy matching for "did you mean?" suggestions.
 *
 * Uses Levenshtein distance to find the closest match among candidates.
 */

/**
 * Compute Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0) as number[]);

  for (let i = 0; i <= la; i++) dp[i]![0] = i;
  for (let j = 0; j <= lb; j++) dp[0]![j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }

  return dp[la]![lb]!;
}

/**
 * Find the closest match to `input` from `candidates`.
 *
 * Returns the best match if its edit distance is within a reasonable threshold
 * (at most half the length of the candidate, minimum 2). Returns undefined
 * if no candidate is close enough.
 */
export function suggestClosest(input: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;

  let bestMatch: string | undefined;
  let bestDist = Infinity;

  const lower = input.toLowerCase();

  for (const candidate of candidates) {
    const dist = levenshtein(lower, candidate.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = candidate;
    }
  }

  if (bestMatch === undefined) return undefined;

  // Threshold: allow at most half the longer string's length (min 2)
  const maxDist = Math.max(2, Math.ceil(Math.max(input.length, bestMatch.length) / 2));
  return bestDist <= maxDist ? bestMatch : undefined;
}
