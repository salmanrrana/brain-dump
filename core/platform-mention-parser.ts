/**
 * Platform mention parser for auto-tagging tickets.
 *
 * Detects references to external platforms (JIRA, Linear, GitHub, GitLab,
 * Confluence, Notion, Asana, Trello, ClickUp) in ticket title/description
 * and generates platform-specific tags automatically on ticket creation.
 *
 * @module core/platform-mention-parser
 */

export interface PlatformMention {
  platform: string;
  type: string;
  identifier: string;
  tag: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// URL-based parsers (run first to disambiguate JIRA vs Linear)
// ---------------------------------------------------------------------------

const urlParsers: Array<{
  pattern: RegExp;
  parse: (match: RegExpExecArray) => PlatformMention;
}> = [
  // GitHub issues/PRs via URL
  {
    pattern: /https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(issues|pull)\/(\d+)/g,
    parse: (m) => ({
      platform: "github",
      type: m[3] === "pull" ? "pr" : "issue",
      identifier: `${m[1]}/${m[2]}#${m[4]}`,
      tag: `github:${m[1]}/${m[2]}#${m[4]}`,
      url: m[0],
    }),
  },
  // Linear via URL
  {
    pattern: /https?:\/\/linear\.app\/[a-zA-Z0-9_-]+\/issue\/([A-Z][A-Z0-9]*-\d+)/g,
    parse: (m) => ({
      platform: "linear",
      type: "issue",
      identifier: m[1]!,
      tag: `linear:${m[1]}`,
      url: m[0],
    }),
  },
  // JIRA via URL
  {
    pattern: /https?:\/\/[a-zA-Z0-9_-]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]*-\d+)/g,
    parse: (m) => ({
      platform: "jira",
      type: "issue",
      identifier: m[1]!,
      tag: `jira:${m[1]}`,
      url: m[0],
    }),
  },
  // Confluence
  {
    pattern: /https?:\/\/[a-zA-Z0-9_-]+\.atlassian\.net\/wiki\/spaces\/([A-Z]+)\/pages\/\d+/g,
    parse: (m) => ({
      platform: "confluence",
      type: "page",
      identifier: m[1]!,
      tag: `confluence:${m[1]}`,
      url: m[0],
    }),
  },
  // Notion
  {
    pattern: /https?:\/\/(?:www\.)?notion\.so\/[^\s]*([0-9a-f]{32})/gi,
    parse: (m) => ({
      platform: "notion",
      type: "page",
      identifier: m[1]!,
      tag: "notion:page",
      url: m[0],
    }),
  },
  // Asana
  {
    pattern: /https?:\/\/app\.asana\.com\/0\/\d+\/(\d{13,16})/g,
    parse: (m) => ({
      platform: "asana",
      type: "task",
      identifier: m[1]!,
      tag: "asana:task",
      url: m[0],
    }),
  },
  // Trello
  {
    pattern: /https?:\/\/trello\.com\/c\/([a-zA-Z0-9]{8,10})/g,
    parse: (m) => ({
      platform: "trello",
      type: "card",
      identifier: m[1]!,
      tag: `trello:${m[1]}`,
      url: m[0],
    }),
  },
];

// ---------------------------------------------------------------------------
// Text-based parsers (run after URLs to avoid double-matching)
// ---------------------------------------------------------------------------

const textParsers: Array<{
  pattern: RegExp;
  parse: (match: RegExpExecArray) => PlatformMention;
}> = [
  // GitLab merge request: group/project!123
  {
    pattern: /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)!(\d+)/g,
    parse: (m) => ({
      platform: "gitlab",
      type: "mr",
      identifier: `${m[1]}!${m[2]}`,
      tag: `gitlab-mr:${m[1]}!${m[2]}`,
    }),
  },
  // Cross-repo GitHub ref: org/repo#123
  {
    pattern: /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)/g,
    parse: (m) => ({
      platform: "github",
      type: "issue",
      identifier: `${m[1]}#${m[2]}`,
      tag: `github:${m[1]}#${m[2]}`,
    }),
  },
  // Same-repo GitHub ref: #123 (must not be preceded by slash/word char to avoid matching URL fragments)
  {
    pattern: /(?<![a-zA-Z0-9_./])#(\d+)\b/g,
    parse: (m) => ({
      platform: "github",
      type: "issue",
      identifier: `#${m[1]}`,
      tag: `github:#${m[1]}`,
    }),
  },
  // JIRA/Linear/ClickUp project key: PROJ-123 (generic — tagged as source: since ambiguous)
  {
    pattern: /\b([A-Z][A-Z0-9]*)-(\d+)\b/g,
    parse: (m) => ({
      platform: "source",
      type: "issue",
      identifier: `${m[1]}-${m[2]}`,
      tag: `source:${m[1]}-${m[2]}`,
    }),
  },
];

// Set of URL-matched identifiers used to skip text duplicates
function collectUrlMatchedIds(mentions: PlatformMention[]): Set<string> {
  const ids = new Set<string>();
  for (const m of mentions) {
    ids.add(m.identifier);
    // For GitHub URL matches like "org/repo#42", also add the project-key
    // portion so "PROJ-123" in a JIRA URL won't also match as source:PROJ-123
    const keyMatch = m.identifier.match(/^([A-Z][A-Z0-9]*-\d+)$/);
    if (keyMatch) ids.add(keyMatch[1]!);
  }
  return ids;
}

/**
 * Parse platform mentions from free text.
 * URL-based patterns run first to enable disambiguation (JIRA vs Linear).
 * Text-based patterns skip identifiers already captured by URL parsers.
 */
export function parsePlatformMentions(text: string): PlatformMention[] {
  if (!text) return [];

  const mentions: PlatformMention[] = [];
  const seenTags = new Set<string>();

  // Phase 1: URL-based matches
  for (const { pattern, parse } of urlParsers) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const mention = parse(match);
      if (!seenTags.has(mention.tag)) {
        seenTags.add(mention.tag);
        mentions.push(mention);
      }
    }
  }

  // Collect identifiers from URL matches so text parsers can skip them
  const urlIds = collectUrlMatchedIds(mentions);

  // Phase 2: Text-based matches (skip what URLs already captured)
  // Strip URLs from text to avoid double-matching
  const textWithoutUrls = text.replace(/https?:\/\/[^\s)]+/g, "");

  for (const { pattern, parse } of textParsers) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(textWithoutUrls)) !== null) {
      const mention = parse(match);
      // Skip if the identifier was already captured from a URL
      if (urlIds.has(mention.identifier)) continue;
      if (!seenTags.has(mention.tag)) {
        seenTags.add(mention.tag);
        mentions.push(mention);
      }
    }
  }

  return mentions;
}

/**
 * Auto-generate platform tags from ticket title and description.
 * Merges with existing tags, preventing duplicates.
 * Returns the final tag array (existing + auto-detected).
 */
export function autoTagFromMentions(
  title: string,
  description: string | null,
  existingTags: string[]
): string[] {
  const combinedText = [title, description].filter(Boolean).join("\n");
  const mentions = parsePlatformMentions(combinedText);

  if (mentions.length === 0) return existingTags;

  const existing = new Set(existingTags.map((t) => t.toLowerCase()));
  const result = [...existingTags];

  for (const mention of mentions) {
    if (!existing.has(mention.tag.toLowerCase())) {
      existing.add(mention.tag.toLowerCase());
      result.push(mention.tag);
    }
  }

  return result;
}
