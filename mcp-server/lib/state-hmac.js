/**
 * HMAC integrity verification for ralph-state.json files.
 * Provides optional security hardening to detect tampering with state files.
 *
 * Threat model: Malicious code in a worktree could modify ralph-state.json
 * to trick hooks into bypassing state enforcement. HMAC detects this tampering.
 *
 * This feature is opt-in via the ENABLE_RALPH_STATE_HMAC environment variable.
 *
 * @module lib/state-hmac
 */
import crypto from "crypto";
import os from "os";
import { log } from "./logging.js";

/**
 * Environment variable to enable HMAC verification.
 * When enabled, ralph-state.json files will include HMAC signatures.
 */
const ENABLE_HMAC_ENV = "ENABLE_RALPH_STATE_HMAC";

/**
 * Check if HMAC verification is enabled via environment variable.
 * @returns {boolean} True if HMAC should be used
 */
export function isHmacEnabled() {
  const value = process.env[ENABLE_HMAC_ENV];
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Generate a machine-specific HMAC key.
 * Uses hostname + username to create a key that is:
 * - Consistent on the same machine for the same user
 * - Different across machines/users (prevents key sharing)
 * - Does not require external secret management
 *
 * Note: This is NOT cryptographically ideal (known plaintext) but provides
 * practical protection against casual tampering. For high-security environments,
 * consider using a proper secret management system.
 *
 * @returns {Buffer} 32-byte HMAC key
 */
function generateMachineKey() {
  const hostname = os.hostname();

  // os.userInfo() can throw in containerized environments without /etc/passwd
  let username;
  try {
    username = os.userInfo().username;
  } catch {
    // Fallback to environment variables commonly set in containers
    username = process.env.USER || process.env.USERNAME || "unknown";
    log.debug(`os.userInfo() unavailable, using fallback username: ${username}`);
  }

  const keyMaterial = `ralph-state:${hostname}:${username}`;

  return crypto.createHash("sha256")
    .update(keyMaterial)
    .digest();
}

/**
 * Recursively sort object keys for canonical JSON output.
 * Handles nested objects and arrays correctly.
 *
 * @param {unknown} value - Value to canonicalize
 * @returns {unknown} Canonicalized value
 */
function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  // Sort object keys and recursively canonicalize values
  const sortedKeys = Object.keys(value).sort();
  const result = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(value[key]);
  }
  return result;
}

/**
 * Generate an HMAC signature for state data.
 *
 * @param {object} stateData - The state object to sign (without _hmac field)
 * @returns {string} Hex-encoded HMAC-SHA256 signature
 */
export function generateStateHmac(stateData) {
  const key = generateMachineKey();

  // Create a copy without _hmac to ensure consistent signing
  const { _hmac: _ignored, ...dataToSign } = stateData;

  // Recursively sort keys for deterministic JSON output
  const canonicalData = canonicalize(dataToSign);
  const canonicalJson = JSON.stringify(canonicalData);

  return crypto.createHmac("sha256", key)
    .update(canonicalJson)
    .digest("hex");
}

/**
 * Verify the HMAC signature of state data.
 *
 * @param {object} stateData - The state object including _hmac field
 * @returns {{valid: boolean, reason?: string}} Verification result
 */
export function verifyStateHmac(stateData) {
  if (!stateData || typeof stateData !== "object") {
    return { valid: false, reason: "Invalid state data format" };
  }

  const storedHmac = stateData._hmac;
  if (!storedHmac) {
    // No HMAC present - could be from before HMAC was enabled
    // or from a version that doesn't support HMAC
    return { valid: false, reason: "No HMAC signature present" };
  }

  const expectedHmac = generateStateHmac(stateData);

  // Use timing-safe comparison to prevent timing attacks
  try {
    const storedBuffer = Buffer.from(storedHmac, "hex");
    const expectedBuffer = Buffer.from(expectedHmac, "hex");

    if (storedBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: "HMAC length mismatch" };
    }

    if (crypto.timingSafeEqual(storedBuffer, expectedBuffer)) {
      return { valid: true };
    } else {
      return { valid: false, reason: "HMAC signature mismatch - possible tampering" };
    }
  } catch (err) {
    return { valid: false, reason: `HMAC verification error: ${err.message}` };
  }
}

/**
 * Add HMAC signature to state data if HMAC is enabled.
 *
 * @param {object} stateData - The state object to sign
 * @returns {object} State data with _hmac field added (if enabled)
 */
export function signStateData(stateData) {
  if (!isHmacEnabled()) {
    // HMAC not enabled, return data without signature
    return stateData;
  }

  const hmac = generateStateHmac(stateData);
  log.debug(`Generated HMAC for ralph-state: ${hmac.substring(0, 16)}...`);

  return {
    ...stateData,
    _hmac: hmac,
  };
}

/**
 * Verify state data HMAC if enabled, logging warnings for tampering.
 *
 * IMPORTANT: This function logs warnings but does NOT block operations.
 * The threat model assumes we want visibility into tampering, not to
 * completely block potentially valid state.
 *
 * @param {object} stateData - The state object to verify
 * @returns {object} The state data (unchanged) with verification result logged
 */
export function verifyAndWarnStateData(stateData) {
  if (!isHmacEnabled()) {
    // HMAC not enabled, skip verification
    return stateData;
  }

  const result = verifyStateHmac(stateData);

  if (!result.valid) {
    log.warn(`Ralph state HMAC verification failed: ${result.reason}`, {
      sessionId: stateData?.sessionId?.substring(0, 8),
      ticketId: stateData?.ticketId?.substring(0, 8),
      currentState: stateData?.currentState,
    });

    // Log additional context for security monitoring
    log.warn("SECURITY: Possible ralph-state.json tampering detected. " +
      "This could indicate malicious code modified the state file. " +
      "Consider investigating the worktree for unexpected changes.");
  } else {
    log.debug(`Ralph state HMAC verified successfully for session ${stateData?.sessionId?.substring(0, 8)}`);
  }

  return stateData;
}
