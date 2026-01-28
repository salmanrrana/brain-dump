/**
 * HMAC utilities for conversation message tamper detection.
 * @module lib/conversation-hash
 */
import { createHmac } from "crypto";
import { hostname } from "os";

/**
 * Compute HMAC-SHA256 hash for tamper detection.
 * Uses a derived key from machine hostname + session ID for simplicity.
 * In production, this should use a proper secret management system.
 *
 * @param content - Content to hash
 * @param sessionId - Session ID for key derivation
 * @returns Hex-encoded HMAC-SHA256 hash
 */
export function computeContentHash(content: string, sessionId: string): string {
  // Derive a simple key from hostname + session ID
  // Note: In production, use proper key management
  const key = `brain-dump:${hostname()}:${sessionId}`;
  return createHmac("sha256", key).update(content).digest("hex");
}
