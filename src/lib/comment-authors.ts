export const BASE_COMMENT_AUTHORS = [
  "claude",
  "ralph",
  "user",
  "opencode",
  "cursor",
  "vscode",
  "copilot",
  "codex",
  "pi",
  "cursor-agent",
  "ai",
  "brain-dump",
] as const;

export type BaseCommentAuthor = (typeof BASE_COMMENT_AUTHORS)[number];
export type CommentAuthor = BaseCommentAuthor | `ralph:${string}`;

export interface CommentAuthorStyle {
  gradient: [string, string];
  display: "letter" | string;
  color: string;
  textColor: string;
}

const COMMENT_AUTHOR_STYLES: Record<BaseCommentAuthor, CommentAuthorStyle> = {
  claude: {
    gradient: ["#a855f7", "#8b5cf6"],
    display: "CL",
    color: "#ffffff",
    textColor: "#a855f7",
  },
  ralph: {
    gradient: ["#06b6d4", "#3b82f6"],
    display: "R",
    color: "#ffffff",
    textColor: "#06b6d4",
  },
  user: {
    gradient: ["#f97316", "#f59e0b"],
    display: "letter",
    color: "#ffffff",
    textColor: "#f97316",
  },
  opencode: {
    gradient: ["#22c55e", "#10b981"],
    display: "OC",
    color: "#ffffff",
    textColor: "#22c55e",
  },
  cursor: {
    gradient: ["#0f172a", "#334155"],
    display: "CU",
    color: "#ffffff",
    textColor: "#334155",
  },
  vscode: {
    gradient: ["#2563eb", "#1d4ed8"],
    display: "VS",
    color: "#ffffff",
    textColor: "#2563eb",
  },
  copilot: {
    gradient: ["#111827", "#374151"],
    display: "GH",
    color: "#ffffff",
    textColor: "#374151",
  },
  codex: {
    gradient: ["#059669", "#0f766e"],
    display: "CX",
    color: "#ffffff",
    textColor: "#059669",
  },
  pi: {
    gradient: ["#8b5cf6", "#ec4899"],
    display: "PI",
    color: "#ffffff",
    textColor: "#8b5cf6",
  },
  "cursor-agent": {
    gradient: ["#f59e0b", "#d97706"],
    display: "CA",
    color: "#ffffff",
    textColor: "#f59e0b",
  },
  ai: {
    gradient: ["#6366f1", "#4f46e5"],
    display: "AI",
    color: "#ffffff",
    textColor: "#6366f1",
  },
  "brain-dump": {
    gradient: ["#475569", "#334155"],
    display: "BD",
    color: "#ffffff",
    textColor: "#475569",
  },
};

const COMMENT_AUTHOR_LABELS: Record<BaseCommentAuthor, string> = {
  claude: "Claude",
  ralph: "Ralph",
  user: "User",
  opencode: "OpenCode",
  cursor: "Cursor",
  vscode: "VS Code",
  copilot: "Copilot",
  codex: "Codex",
  pi: "Pi",
  "cursor-agent": "Cursor Agent",
  ai: "AI",
  "brain-dump": "Brain Dump",
};

export function isKnownBaseCommentAuthor(author: string): author is BaseCommentAuthor {
  return (BASE_COMMENT_AUTHORS as readonly string[]).includes(author);
}

export function isValidCommentAuthor(author: string): author is CommentAuthor {
  if (isKnownBaseCommentAuthor(author)) {
    return true;
  }

  if (!author.startsWith("ralph:")) {
    return false;
  }

  const provider = author.slice("ralph:".length);
  return provider.trim().length > 0;
}

export function getCommentAuthorBase(author: string): BaseCommentAuthor {
  if (author.startsWith("ralph:")) {
    return "ralph";
  }

  if (isKnownBaseCommentAuthor(author)) {
    return author;
  }

  return "user";
}

export function getCommentAuthorDisplayName(author: string): string {
  if (author.startsWith("ralph:")) {
    const provider = author.slice("ralph:".length).trim();
    if (provider.length === 0) {
      return COMMENT_AUTHOR_LABELS.ralph;
    }

    return `Ralph (${getCommentAuthorDisplayName(provider)})`;
  }

  if (isKnownBaseCommentAuthor(author)) {
    return COMMENT_AUTHOR_LABELS[author];
  }

  return author;
}

export function getCommentAuthorStyle(author: string): CommentAuthorStyle {
  return COMMENT_AUTHOR_STYLES[getCommentAuthorBase(author)];
}
