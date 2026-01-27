/**
 * Tests for state-hmac.js - HMAC integrity verification for ralph-state.json
 * Following Kent C. Dodds philosophy: test user-facing behavior, not internals
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isHmacEnabled,
  generateStateHmac,
  verifyStateHmac,
  signStateData,
  verifyAndWarnStateData,
} from "../state-hmac.js";

describe("state-hmac", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.ENABLE_RALPH_STATE_HMAC;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isHmacEnabled", () => {
    it("returns false when environment variable is not set", () => {
      delete process.env.ENABLE_RALPH_STATE_HMAC;
      expect(isHmacEnabled()).toBe(false);
    });

    it("returns true when set to '1'", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "1";
      expect(isHmacEnabled()).toBe(true);
    });

    it("returns true when set to 'true'", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "true";
      expect(isHmacEnabled()).toBe(true);
    });

    it("returns true when set to 'yes'", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "yes";
      expect(isHmacEnabled()).toBe(true);
    });

    it("returns false when set to other values", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "false";
      expect(isHmacEnabled()).toBe(false);

      process.env.ENABLE_RALPH_STATE_HMAC = "0";
      expect(isHmacEnabled()).toBe(false);

      process.env.ENABLE_RALPH_STATE_HMAC = "no";
      expect(isHmacEnabled()).toBe(false);
    });
  });

  describe("generateStateHmac", () => {
    it("generates consistent HMAC for same data", () => {
      const stateData = {
        sessionId: "test-session-123",
        ticketId: "ticket-456",
        currentState: "implementing",
        updatedAt: "2026-01-27T10:00:00.000Z",
      };

      const hmac1 = generateStateHmac(stateData);
      const hmac2 = generateStateHmac(stateData);

      expect(hmac1).toBe(hmac2);
      expect(hmac1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it("generates different HMAC for different data", () => {
      const stateData1 = {
        sessionId: "session-1",
        currentState: "implementing",
      };

      const stateData2 = {
        sessionId: "session-2",
        currentState: "implementing",
      };

      const hmac1 = generateStateHmac(stateData1);
      const hmac2 = generateStateHmac(stateData2);

      expect(hmac1).not.toBe(hmac2);
    });

    it("ignores existing _hmac field when generating", () => {
      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
        _hmac: "old-hmac-value",
      };

      const stateDataWithout = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const hmac1 = generateStateHmac(stateData);
      const hmac2 = generateStateHmac(stateDataWithout);

      expect(hmac1).toBe(hmac2);
    });

    it("produces deterministic output regardless of key order", () => {
      const stateData1 = {
        sessionId: "test",
        currentState: "implementing",
        ticketId: "ticket",
      };

      const stateData2 = {
        ticketId: "ticket",
        currentState: "implementing",
        sessionId: "test",
      };

      const hmac1 = generateStateHmac(stateData1);
      const hmac2 = generateStateHmac(stateData2);

      expect(hmac1).toBe(hmac2);
    });

    it("handles nested objects with different key orders", () => {
      const stateData1 = {
        sessionId: "test",
        metadata: {
          zebra: "last",
          alpha: "first",
          nested: {
            z: 1,
            a: 2,
          },
        },
      };

      const stateData2 = {
        metadata: {
          alpha: "first",
          nested: {
            a: 2,
            z: 1,
          },
          zebra: "last",
        },
        sessionId: "test",
      };

      const hmac1 = generateStateHmac(stateData1);
      const hmac2 = generateStateHmac(stateData2);

      expect(hmac1).toBe(hmac2);
    });

    it("handles arrays within objects", () => {
      const stateData1 = {
        sessionId: "test",
        stateHistory: ["idle", "analyzing", "implementing"],
        tags: [{ name: "urgent" }, { name: "feature" }],
      };

      const stateData2 = {
        stateHistory: ["idle", "analyzing", "implementing"],
        sessionId: "test",
        tags: [{ name: "urgent" }, { name: "feature" }],
      };

      const hmac1 = generateStateHmac(stateData1);
      const hmac2 = generateStateHmac(stateData2);

      expect(hmac1).toBe(hmac2);
    });
  });

  describe("verifyStateHmac", () => {
    it("returns valid for correctly signed data", () => {
      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const hmac = generateStateHmac(stateData);
      const signedData = { ...stateData, _hmac: hmac };

      const result = verifyStateHmac(signedData);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("returns invalid for tampered data", () => {
      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const hmac = generateStateHmac(stateData);
      const tamperedData = {
        sessionId: "test-session",
        currentState: "done", // Tampered!
        _hmac: hmac,
      };

      const result = verifyStateHmac(tamperedData);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("mismatch");
    });

    it("returns invalid for missing HMAC", () => {
      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const result = verifyStateHmac(stateData);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("No HMAC signature present");
    });

    it("returns invalid for null/undefined input", () => {
      expect(verifyStateHmac(null as unknown as Record<string, unknown>).valid).toBe(false);
      expect(verifyStateHmac(undefined as unknown as Record<string, unknown>).valid).toBe(false);
    });

    it("returns invalid for wrong HMAC length", () => {
      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
        _hmac: "tooshort",
      };

      const result = verifyStateHmac(stateData);

      expect(result.valid).toBe(false);
    });
  });

  describe("signStateData", () => {
    it("returns data without HMAC when disabled", () => {
      delete process.env.ENABLE_RALPH_STATE_HMAC;

      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const result = signStateData(stateData);

      expect(result._hmac).toBeUndefined();
      expect(result.sessionId).toBe("test-session");
    });

    it("adds HMAC when enabled", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "1";

      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const result = signStateData(stateData);

      expect(result._hmac).toBeDefined();
      expect(result._hmac).toHaveLength(64);
      expect(result.sessionId).toBe("test-session");
    });

    it("signed data passes verification", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "1";

      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
        ticketId: "ticket-123",
      };

      const signedData = signStateData(stateData);
      const result = verifyStateHmac(signedData);

      expect(result.valid).toBe(true);
    });
  });

  describe("verifyAndWarnStateData", () => {
    it("returns data unchanged when HMAC disabled", () => {
      delete process.env.ENABLE_RALPH_STATE_HMAC;

      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
      };

      const result = verifyAndWarnStateData(stateData);

      expect(result).toEqual(stateData);
    });

    it("returns data unchanged when HMAC enabled (verification is logged, not blocking)", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "1";

      const stateData = {
        sessionId: "test-session",
        currentState: "implementing",
        _hmac: "invalid-hmac",
      };

      // Should not throw, just log warning
      const result = verifyAndWarnStateData(stateData);

      expect(result).toEqual(stateData);
    });
  });

  describe("round-trip integrity", () => {
    it("data survives JSON serialization round-trip", () => {
      process.env.ENABLE_RALPH_STATE_HMAC = "1";

      const stateData = {
        sessionId: "test-session-abc123",
        ticketId: "ticket-def456",
        currentState: "implementing",
        stateHistory: ["idle", "analyzing", "implementing"],
        startedAt: "2026-01-27T10:00:00.000Z",
        updatedAt: "2026-01-27T10:30:00.000Z",
      };

      // Sign the data
      const signedData = signStateData(stateData);

      // Simulate file write/read (JSON round-trip)
      const json = JSON.stringify(signedData, null, 2);
      const parsed = JSON.parse(json);

      // Verify after round-trip
      const result = verifyStateHmac(parsed);

      expect(result.valid).toBe(true);
    });
  });
});
