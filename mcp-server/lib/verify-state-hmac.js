#!/usr/bin/env node
/**
 * CLI utility to verify ralph-state.json HMAC signature.
 * Used by shell hooks to detect tampering when HMAC is enabled.
 *
 * Usage: node verify-state-hmac.js <path-to-state-file>
 *
 * Exit codes:
 *   0 - HMAC valid or HMAC not enabled
 *   1 - HMAC invalid (possible tampering)
 *   2 - Error reading file or other issues
 *
 * Output (JSON):
 *   { "enabled": boolean, "valid": boolean, "reason": string }
 */
import { readFileSync } from "fs";
import { isHmacEnabled, verifyStateHmac } from "./state-hmac.js";

const stateFilePath = process.argv[2];

if (!stateFilePath) {
  console.log(JSON.stringify({
    enabled: false,
    valid: false,
    reason: "Usage: verify-state-hmac.js <state-file-path>",
  }));
  process.exit(2);
}

// Check if HMAC verification is enabled
if (!isHmacEnabled()) {
  console.log(JSON.stringify({
    enabled: false,
    valid: true,
    reason: "HMAC verification not enabled (ENABLE_RALPH_STATE_HMAC not set)",
  }));
  process.exit(0);
}

// Read and verify the state file
try {
  const content = readFileSync(stateFilePath, "utf-8");
  const stateData = JSON.parse(content);

  const result = verifyStateHmac(stateData);

  console.log(JSON.stringify({
    enabled: true,
    valid: result.valid,
    reason: result.reason || "HMAC verified successfully",
  }));

  process.exit(result.valid ? 0 : 1);
} catch (err) {
  console.log(JSON.stringify({
    enabled: true,
    valid: false,
    reason: `Error: ${err.message}`,
  }));
  process.exit(2);
}
