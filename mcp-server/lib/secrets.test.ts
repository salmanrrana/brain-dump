import { describe, it, expect } from "vitest";

// Types for the JS module
interface SecretPattern {
  name: string;
  pattern: RegExp;
}

interface SecretDetectionResult {
  detected: boolean;
  types: string[];
  count: number;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const secrets = require("./secrets.js") as {
  detectSecrets: (content: string) => SecretDetectionResult;
  containsSecrets: (content: string) => boolean;
  redactSecrets: (content: string, placeholder?: string) => string;
  SECRET_PATTERNS: SecretPattern[];
};

const { detectSecrets, containsSecrets, redactSecrets, SECRET_PATTERNS } = secrets;

describe("secrets detection module", () => {
  describe("detectSecrets", () => {
    it("should return no secrets for clean content", () => {
      const result = detectSecrets("Hello world, this is a normal message.");
      expect(result.detected).toBe(false);
      expect(result.types).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("should detect OpenAI API keys", () => {
      const result = detectSecrets("My key is sk-abc123def456ghi789jkl012mno345pqr");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("OpenAI API Key");
    });

    it("should detect Anthropic API keys", () => {
      const result = detectSecrets("Use sk-ant-api03-abc123def456ghi789jkl012mno345pqr");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("Anthropic API Key");
    });

    it("should detect AWS Access Key IDs", () => {
      const result = detectSecrets("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("AWS Access Key ID");
    });

    it("should detect GitHub Personal Access Tokens", () => {
      const result = detectSecrets("token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("GitHub Personal Access Token");
    });

    it("should detect GitHub OAuth tokens", () => {
      const result = detectSecrets("GITHUB_TOKEN=gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("GitHub OAuth Access Token");
    });

    it("should detect Slack bot tokens", () => {
      const result = detectSecrets("SLACK_BOT_TOKEN=xoxb-12345-67890-abcdefgh");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("Slack Bot Token");
    });

    it("should detect private keys", () => {
      const rsaResult = detectSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEv...");
      expect(rsaResult.detected).toBe(true);
      expect(rsaResult.types).toContain("RSA Private Key");

      const ecResult = detectSecrets("-----BEGIN EC PRIVATE KEY-----\nMHQC...");
      expect(ecResult.detected).toBe(true);
      expect(ecResult.types).toContain("EC Private Key");

      const genericResult = detectSecrets("-----BEGIN PRIVATE KEY-----\nMIIC...");
      expect(genericResult.detected).toBe(true);
      expect(genericResult.types).toContain("Generic Private Key");
    });

    it("should detect generic password assignments", () => {
      const result1 = detectSecrets('password = "supersecret123"');
      expect(result1.detected).toBe(true);
      expect(result1.types).toContain("Generic Password Assignment");

      const result2 = detectSecrets("api_key: 'my-secret-api-key-value'");
      expect(result2.detected).toBe(true);
      expect(result2.types).toContain("Generic Password Assignment");
    });

    it("should detect Bearer tokens", () => {
      const result = detectSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("Bearer Token");
    });

    it("should detect database connection strings", () => {
      const result = detectSecrets(
        "DATABASE_URL=postgresql://user:password123@localhost:5432/mydb"
      );
      expect(result.detected).toBe(true);
      expect(result.types).toContain("Database Connection String");
    });

    it("should detect Google API keys", () => {
      const result = detectSecrets("GOOGLE_API_KEY=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe");
      expect(result.detected).toBe(true);
      expect(result.types).toContain("Google API Key");
    });

    it("should detect Stripe keys", () => {
      // Use pattern that matches regex but won't trigger GitHub push protection
      const secretResult = detectSecrets("STRIPE_SECRET_KEY=" + "sk_" + "test_" + "x".repeat(24));
      expect(secretResult.detected).toBe(true);
      expect(secretResult.types).toContain("Stripe Secret Key");

      const pubResult = detectSecrets("STRIPE_PUBLISHABLE_KEY=" + "pk_" + "test_" + "x".repeat(24));
      expect(pubResult.detected).toBe(true);
      expect(pubResult.types).toContain("Stripe Publishable Key");
    });

    it("should detect SendGrid API keys", () => {
      // SendGrid keys are format: SG.{22 chars}.{43 chars}
      const result = detectSecrets(
        "SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      );
      expect(result.detected).toBe(true);
      expect(result.types).toContain("SendGrid API Key");
    });

    it("should detect multiple secrets and return all types", () => {
      const content = `
        OPENAI_KEY=sk-abc123def456ghi789jkl012mno345pqr
        GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        password = "hunter2hunter2"
      `;
      const result = detectSecrets(content);
      expect(result.detected).toBe(true);
      expect(result.types).toHaveLength(3);
      expect(result.types).toContain("OpenAI API Key");
      expect(result.types).toContain("GitHub Personal Access Token");
      expect(result.types).toContain("Generic Password Assignment");
      expect(result.count).toBeGreaterThanOrEqual(3);
    });

    it("should count multiple occurrences of same secret type", () => {
      const content = `
        KEY1=sk-abc123def456ghi789jkl012mno345pqr
        KEY2=sk-xyz789abc012def345ghi678jkl901mno
      `;
      const result = detectSecrets(content);
      expect(result.detected).toBe(true);
      expect(result.types).toContain("OpenAI API Key");
      expect(result.count).toBe(2);
    });

    it("should handle null/undefined/empty input gracefully", () => {
      expect(detectSecrets(null as unknown as string)).toEqual({
        detected: false,
        types: [],
        count: 0,
      });
      expect(detectSecrets(undefined as unknown as string)).toEqual({
        detected: false,
        types: [],
        count: 0,
      });
      expect(detectSecrets("")).toEqual({ detected: false, types: [], count: 0 });
    });

    it("should handle non-string input gracefully", () => {
      expect(detectSecrets(123 as unknown as string)).toEqual({
        detected: false,
        types: [],
        count: 0,
      });
      expect(detectSecrets({} as unknown as string)).toEqual({
        detected: false,
        types: [],
        count: 0,
      });
    });

    it("should NOT include actual secret values in result", () => {
      const secret = "sk-abc123def456ghi789jkl012mno345pqr";
      const result = detectSecrets(`My key is ${secret}`);

      // Ensure the result doesn't contain the actual secret
      const resultString = JSON.stringify(result);
      expect(resultString).not.toContain(secret);
    });
  });

  describe("containsSecrets", () => {
    it("should return false for clean content", () => {
      expect(containsSecrets("Hello world")).toBe(false);
    });

    it("should return true when secrets are present", () => {
      expect(containsSecrets("sk-abc123def456ghi789jkl012mno345pqr")).toBe(true);
    });

    it("should handle null/undefined gracefully", () => {
      expect(containsSecrets(null as unknown as string)).toBe(false);
      expect(containsSecrets(undefined as unknown as string)).toBe(false);
    });
  });

  describe("redactSecrets", () => {
    it("should return content unchanged when no secrets present", () => {
      const content = "Hello world, this is safe content.";
      expect(redactSecrets(content)).toBe(content);
    });

    it("should redact OpenAI API keys", () => {
      const content = "Use this key: sk-abc123def456ghi789jkl012mno345pqr";
      const redacted = redactSecrets(content);
      expect(redacted).toBe("Use this key: [REDACTED]");
      expect(redacted).not.toContain("sk-abc123");
    });

    it("should redact multiple secrets", () => {
      const content =
        "Key1: sk-abc123def456ghi789jkl012mno345pqr, Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const redacted = redactSecrets(content);
      expect(redacted).toBe("Key1: [REDACTED], Token: [REDACTED]");
    });

    it("should use custom placeholder", () => {
      const content = "Key: sk-abc123def456ghi789jkl012mno345pqr";
      const redacted = redactSecrets(content, "***HIDDEN***");
      expect(redacted).toBe("Key: ***HIDDEN***");
    });

    it("should handle null/undefined gracefully", () => {
      expect(redactSecrets(null as unknown as string)).toBe(null);
      expect(redactSecrets(undefined as unknown as string)).toBe(undefined);
    });
  });

  describe("SECRET_PATTERNS", () => {
    it("should have all required patterns defined", () => {
      const patternNames = (SECRET_PATTERNS as SecretPattern[]).map((p) => p.name);

      expect(patternNames).toContain("OpenAI API Key");
      expect(patternNames).toContain("Anthropic API Key");
      expect(patternNames).toContain("AWS Access Key ID");
      expect(patternNames).toContain("GitHub Personal Access Token");
      expect(patternNames).toContain("Slack Bot Token");
      expect(patternNames).toContain("RSA Private Key");
      expect(patternNames).toContain("Generic Password Assignment");
    });

    it("should have all patterns as RegExp objects", () => {
      for (const { pattern } of SECRET_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });
});
