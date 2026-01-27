/**
 * Type declarations for state-hmac.js
 */

/**
 * Check if HMAC verification is enabled via environment variable.
 */
export function isHmacEnabled(): boolean;

/**
 * Generate an HMAC signature for state data.
 */
export function generateStateHmac(stateData: Record<string, unknown>): string;

/**
 * Verify the HMAC signature of state data.
 */
export function verifyStateHmac(stateData: Record<string, unknown>): {
  valid: boolean;
  reason?: string;
};

/**
 * Add HMAC signature to state data if HMAC is enabled.
 */
export function signStateData<T extends Record<string, unknown>>(
  stateData: T
): T & { _hmac?: string };

/**
 * Verify state data HMAC if enabled, logging warnings for tampering.
 */
export function verifyAndWarnStateData<T extends Record<string, unknown>>(stateData: T): T;
