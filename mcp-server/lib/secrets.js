/**
 * Secret detection utilities for Brain Dump MCP server.
 * Scans content for potential credentials without logging or storing the actual secrets.
 * @module lib/secrets
 */

/**
 * Secret pattern definitions with human-readable names.
 * Each pattern is designed to minimize false positives while catching common secret formats.
 * @type {Array<{name: string, pattern: RegExp}>}
 */
export const SECRET_PATTERNS = [
  {
    name: "OpenAI API Key",
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
  },
  {
    name: "Anthropic API Key",
    pattern: /sk-ant-[a-zA-Z0-9-]{32,}/g,
  },
  {
    name: "AWS Access Key ID",
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: "AWS Secret Access Key",
    // AWS secret keys are 40 characters of base64
    pattern: /(?<![a-zA-Z0-9/+=])[a-zA-Z0-9/+=]{40}(?![a-zA-Z0-9/+=])/g,
  },
  {
    name: "GitHub Personal Access Token",
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
  },
  {
    name: "GitHub OAuth Access Token",
    pattern: /gho_[a-zA-Z0-9]{36}/g,
  },
  {
    name: "GitHub App Token",
    pattern: /(?:ghu|ghs)_[a-zA-Z0-9]{36}/g,
  },
  {
    name: "Slack Bot Token",
    pattern: /xoxb-[a-zA-Z0-9-]+/g,
  },
  {
    name: "Slack User Token",
    pattern: /xoxp-[a-zA-Z0-9-]+/g,
  },
  {
    name: "Slack App Token",
    pattern: /xoxa-[a-zA-Z0-9-]+/g,
  },
  {
    name: "Slack Refresh Token",
    pattern: /xoxr-[a-zA-Z0-9-]+/g,
  },
  {
    name: "RSA Private Key",
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
  },
  {
    name: "EC Private Key",
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
  },
  {
    name: "Generic Private Key",
    pattern: /-----BEGIN PRIVATE KEY-----/g,
  },
  {
    name: "OpenSSH Private Key",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
  },
  {
    name: "Generic Password Assignment",
    // Matches password = "...", password: '...', PASSWORD="...", etc.
    pattern: /(?:password|passwd|pwd|secret|api_key|apikey|api-key)\s*[:=]\s*["'][^"']{8,}["']/gi,
  },
  {
    name: "Bearer Token",
    pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/g,
  },
  {
    name: "Basic Auth Credentials",
    // Matches Authorization: Basic base64...
    pattern: /Basic\s+[a-zA-Z0-9+/=]{20,}/g,
  },
  {
    name: "Database Connection String",
    // Matches postgresql://, mysql://, mongodb:// with credentials
    pattern: /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "Google API Key",
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
  },
  {
    name: "Stripe Secret Key",
    pattern: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
  },
  {
    name: "Stripe Publishable Key",
    pattern: /pk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
  },
  {
    name: "SendGrid API Key",
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
  },
  {
    name: "Twilio Account SID",
    pattern: /AC[a-f0-9]{32}/g,
  },
  {
    name: "Twilio Auth Token",
    pattern: /(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])/g,
  },
];

/**
 * Result of secret detection scan.
 * @typedef {Object} SecretDetectionResult
 * @property {boolean} detected - Whether any secrets were detected
 * @property {string[]} types - Array of detected secret type names (no actual values)
 * @property {number} count - Total number of potential secrets found
 */

/**
 * Scan content for potential secrets without exposing the actual values.
 *
 * SECURITY: This function intentionally does NOT return the matched values,
 * only the types of secrets detected. This prevents accidental logging or
 * storage of sensitive credentials.
 *
 * @param {string} content - The text content to scan for secrets
 * @returns {SecretDetectionResult} Detection result with types but not values
 *
 * @example
 * const result = detectSecrets('My API key is sk-abc123def456...');
 * // result = { detected: true, types: ['OpenAI API Key'], count: 1 }
 */
export function detectSecrets(content) {
  if (!content || typeof content !== "string") {
    return { detected: false, types: [], count: 0 };
  }

  const detectedTypes = new Set();
  let totalCount = 0;

  for (const { name, pattern } of SECRET_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = content.match(pattern);

    if (matches && matches.length > 0) {
      detectedTypes.add(name);
      totalCount += matches.length;
    }
  }

  return {
    detected: detectedTypes.size > 0,
    types: Array.from(detectedTypes).sort(),
    count: totalCount,
  };
}

/**
 * Check if a single piece of content contains any secrets.
 * Lighter-weight check that returns early on first match.
 *
 * @param {string} content - The text content to check
 * @returns {boolean} True if any secret pattern matches
 */
export function containsSecrets(content) {
  if (!content || typeof content !== "string") {
    return false;
  }

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Redact detected secrets from content for safe logging.
 * Replaces matched patterns with a redaction placeholder.
 *
 * IMPORTANT: This is for logging purposes only. The original content
 * should still be stored (encrypted) for compliance requirements.
 *
 * @param {string} content - The text content to redact
 * @param {string} [placeholder='[REDACTED]'] - Replacement text for secrets
 * @returns {string} Content with secrets replaced by placeholder
 */
export function redactSecrets(content, placeholder = "[REDACTED]") {
  if (!content || typeof content !== "string") {
    return content;
  }

  let redacted = content;

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, placeholder);
  }

  return redacted;
}
