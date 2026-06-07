import type { ReactNode } from "react";

type CodeTokenKind =
  | "plain"
  | "comment"
  | "function"
  | "keyword"
  | "literal"
  | "number"
  | "operator"
  | "property"
  | "punctuation"
  | "string"
  | "type";

interface CodeToken {
  kind: CodeTokenKind;
  value: string;
}

export type DiffLineKind = "addition" | "context" | "deletion" | "hunk" | "metadata";

const MAX_HIGHLIGHT_LINE_LENGTH = 1_000;

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shell",
  cjs: "javascript",
  docker: "dockerfile",
  htm: "html",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  ps1: "powershell",
  py: "python",
  sh: "shell",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "shell",
};

const SUPPORTED_LANGUAGES = new Set([
  "css",
  "dockerfile",
  "go",
  "html",
  "javascript",
  "json",
  "markdown",
  "powershell",
  "python",
  "rust",
  "shell",
  "sql",
  "typescript",
  "xml",
  "yaml",
]);

const C_LIKE_COMMENT_LANGUAGES = new Set(["css", "go", "javascript", "rust", "typescript"]);

const HASH_COMMENT_LANGUAGES = new Set([
  "dockerfile",
  "markdown",
  "powershell",
  "python",
  "shell",
  "yaml",
]);

const C_LIKE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "namespace",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "set",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "yield",
]);

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const SQL_KEYWORDS = new Set([
  "alter",
  "and",
  "as",
  "by",
  "create",
  "delete",
  "desc",
  "drop",
  "from",
  "group",
  "having",
  "in",
  "insert",
  "into",
  "join",
  "limit",
  "not",
  "null",
  "on",
  "or",
  "order",
  "select",
  "set",
  "table",
  "update",
  "values",
  "where",
]);

const SHELL_KEYWORDS = new Set([
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "then",
  "while",
]);

const LITERALS = new Set([
  "False",
  "Infinity",
  "NaN",
  "None",
  "True",
  "false",
  "null",
  "true",
  "undefined",
]);

const EXTENSION_LANGUAGES: Record<string, string> = {
  bash: "shell",
  cjs: "javascript",
  css: "css",
  dockerfile: "dockerfile",
  go: "go",
  htm: "html",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  ps1: "powershell",
  py: "python",
  rs: "rust",
  sh: "shell",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

const TOKEN_CLASS_NAMES: Record<Exclude<CodeTokenKind, "plain">, string> = {
  comment: "code-token-comment",
  function: "code-token-function",
  keyword: "code-token-keyword",
  literal: "code-token-literal",
  number: "code-token-number",
  operator: "code-token-operator",
  property: "code-token-property",
  punctuation: "code-token-punctuation",
  string: "code-token-string",
  type: "code-token-type",
};

export function normalizeCodeLanguage(language: string | undefined): string | undefined {
  if (!language) {
    return undefined;
  }

  const normalized = language
    .toLowerCase()
    .replace(/^language-/, "")
    .trim();
  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized;
  return SUPPORTED_LANGUAGES.has(aliased) ? aliased : undefined;
}

export function languageFromFilePath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (fileName === "dockerfile" || fileName.endsWith(".dockerfile")) {
    return "dockerfile";
  }

  const extension = fileName.split(".").pop();
  return extension ? normalizeCodeLanguage(EXTENSION_LANGUAGES[extension]) : undefined;
}

export function getDiffLineKind(line: string): DiffLineKind {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "addition";
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return "deletion";
  }

  if (line.startsWith("@@")) {
    return "hunk";
  }

  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to") ||
    line.startsWith("similarity index")
  ) {
    return "metadata";
  }

  return "context";
}

export function renderHighlightedCodeLine(
  line: string,
  language: string | undefined,
  keyPrefix = "code-token"
): ReactNode[] {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (!normalizedLanguage || line.length > MAX_HIGHLIGHT_LINE_LENGTH) {
    return [line || " "];
  }

  const tokens = tokenizeCodeLine(line, normalizedLanguage);
  if (tokens.length === 0) {
    return [" "];
  }

  return tokens.map((token, index) => {
    if (token.kind === "plain") {
      return token.value;
    }

    return (
      <span className={TOKEN_CLASS_NAMES[token.kind]} key={`${keyPrefix}-${index}`}>
        {token.value}
      </span>
    );
  });
}

export function renderHighlightedDiffLine(
  line: string,
  language: string | undefined,
  keyPrefix = "diff-token"
): ReactNode[] {
  const lineKind = getDiffLineKind(line);

  if (lineKind === "hunk") {
    const match = /^(@@[^@]*@@)(.*)$/.exec(line);
    if (!match) {
      return [line || " "];
    }

    return [
      <span className="code-token-hunk" key={`${keyPrefix}-hunk-range`}>
        {match[1]}
      </span>,
      <span className="code-token-comment" key={`${keyPrefix}-hunk-context`}>
        {match[2]}
      </span>,
    ];
  }

  if (lineKind === "metadata") {
    return [
      <span className="code-token-comment" key={`${keyPrefix}-metadata`}>
        {line || " "}
      </span>,
    ];
  }

  const marker = lineKind === "addition" || lineKind === "deletion" ? line[0] : " ";
  const content =
    lineKind === "addition" || lineKind === "deletion"
      ? line.slice(1)
      : line.startsWith(" ")
        ? line.slice(1)
        : line;
  const markerClassName =
    lineKind === "addition"
      ? "code-diff-marker code-diff-marker-addition"
      : lineKind === "deletion"
        ? "code-diff-marker code-diff-marker-deletion"
        : "code-diff-marker";

  return [
    <span className={markerClassName} key={`${keyPrefix}-marker`}>
      {marker}
    </span>,
    ...renderHighlightedCodeLine(content, language, keyPrefix),
  ];
}

function tokenizeCodeLine(line: string, language: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;

  while (index < line.length) {
    const commentEnd = readCommentEnd(line, index, language);
    if (commentEnd !== null) {
      pushToken(tokens, "comment", line.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    const char = line[index] ?? "";
    if (char === "'" || char === '"' || char === "`") {
      const stringEnd = readStringEnd(line, index, char);
      const kind =
        language === "json" && nextNonWhitespace(line, stringEnd) === ":" ? "property" : "string";
      pushToken(tokens, kind, line.slice(index, stringEnd));
      index = stringEnd;
      continue;
    }

    const cssPropertyEnd = readCssCustomPropertyEnd(line, index, language);
    if (cssPropertyEnd !== null) {
      pushToken(tokens, "property", line.slice(index, cssPropertyEnd));
      index = cssPropertyEnd;
      continue;
    }

    const numberMatch = /^[+-]?(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:e[+-]?[\d_]+)?n?)/.exec(
      line.slice(index)
    );
    if (numberMatch?.[0] && startsNumber(line, index, numberMatch[0])) {
      pushToken(tokens, "number", numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    if (isIdentifierStart(char)) {
      const identifierEnd = readIdentifierEnd(line, index, language);
      const word = line.slice(index, identifierEnd);
      pushToken(tokens, classifyIdentifier(word, line, index, identifierEnd, language), word);
      index = identifierEnd;
      continue;
    }

    if (isPunctuation(char)) {
      pushToken(tokens, "punctuation", char);
      index += 1;
      continue;
    }

    if (isOperator(char)) {
      pushToken(tokens, "operator", char);
      index += 1;
      continue;
    }

    pushToken(tokens, "plain", char);
    index += 1;
  }

  return tokens;
}

function readCommentEnd(line: string, index: number, language: string): number | null {
  if (language === "html" || language === "xml") {
    if (!line.startsWith("<!--", index)) {
      return null;
    }

    const end = line.indexOf("-->", index + 4);
    return end === -1 ? line.length : end + 3;
  }

  if (C_LIKE_COMMENT_LANGUAGES.has(language)) {
    if (line.startsWith("//", index)) {
      return line.length;
    }

    if (line.startsWith("/*", index)) {
      const end = line.indexOf("*/", index + 2);
      return end === -1 ? line.length : end + 2;
    }
  }

  if (language === "sql" && line.startsWith("--", index)) {
    return line.length;
  }

  if (HASH_COMMENT_LANGUAGES.has(language) && line[index] === "#") {
    const previous = index === 0 ? " " : (line[index - 1] ?? "");
    if (/\s/.test(previous)) {
      return line.length;
    }
  }

  return null;
}

function readStringEnd(line: string, start: number, quote: string): number {
  let index = start + 1;
  let escaped = false;

  while (index < line.length) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      index += 1;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return line.length;
}

function readCssCustomPropertyEnd(line: string, index: number, language: string): number | null {
  if (language !== "css" || !line.startsWith("--", index)) {
    return null;
  }

  let end = index + 2;
  while (end < line.length && /[\w-]/.test(line[end] ?? "")) {
    end += 1;
  }

  return end > index + 2 ? end : null;
}

function readIdentifierEnd(line: string, start: number, language: string): number {
  let end = start + 1;
  while (end < line.length) {
    const char = line[end] ?? "";
    if (/[\w$]/.test(char) || (language === "css" && char === "-")) {
      end += 1;
      continue;
    }
    break;
  }
  return end;
}

function classifyIdentifier(
  word: string,
  line: string,
  start: number,
  end: number,
  language: string
): CodeTokenKind {
  const lowerWord = word.toLowerCase();
  const previous = previousNonWhitespace(line, start);
  const next = nextNonWhitespace(line, end);

  if (isKeyword(lowerWord, language)) {
    return "keyword";
  }

  if (LITERALS.has(word) || LITERALS.has(lowerWord)) {
    return "literal";
  }

  if (language === "dockerfile" && start === line.search(/\S/)) {
    return "keyword";
  }

  if (language === "html" || language === "xml") {
    if (previous === "<" || previous === "/") {
      return "keyword";
    }
    if (next === "=") {
      return "property";
    }
  }

  if (language === "css" && next === ":") {
    return "property";
  }

  if (previous === "." || next === ":") {
    return "property";
  }

  if (next === "(") {
    return "function";
  }

  if (/^[A-Z]/.test(word)) {
    return "type";
  }

  return "plain";
}

function isKeyword(word: string, language: string): boolean {
  if (language === "python") {
    return PYTHON_KEYWORDS.has(word);
  }

  if (language === "sql") {
    return SQL_KEYWORDS.has(word);
  }

  if (language === "shell" || language === "powershell") {
    return SHELL_KEYWORDS.has(word);
  }

  if (
    language === "go" ||
    language === "rust" ||
    language === "javascript" ||
    language === "typescript"
  ) {
    return C_LIKE_KEYWORDS.has(word);
  }

  return false;
}

function startsNumber(line: string, index: number, match: string): boolean {
  const first = match[0] ?? "";
  if ((first === "+" || first === "-") && !/\d/.test(match[1] ?? "")) {
    return false;
  }

  const previous = index === 0 ? "" : (line[index - 1] ?? "");
  return !/[\w$]/.test(previous);
}

function nextNonWhitespace(line: string, start: number): string | null {
  for (let index = start; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return null;
}

function previousNonWhitespace(line: string, start: number): string | null {
  for (let index = start - 1; index >= 0; index -= 1) {
    const char = line[index] ?? "";
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return null;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isOperator(char: string): boolean {
  return /[=+\-*/%!<>|&~^]/.test(char);
}

function isPunctuation(char: string): boolean {
  return /[{}()[\].,;:?]/.test(char);
}

function pushToken(tokens: CodeToken[], kind: CodeTokenKind, value: string): void {
  if (!value) {
    return;
  }

  const previous = tokens[tokens.length - 1];
  if (previous?.kind === kind) {
    previous.value += value;
    return;
  }

  tokens.push({ kind, value });
}
