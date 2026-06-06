import type { CodeChangeFileSummary } from "../../lib/hooks/code-changes";

export interface CodeChangeFileTreeNode {
  id: string;
  name: string;
  path: string;
  type: "directory" | "file";
  additions: number;
  deletions: number;
  files: number;
  children: CodeChangeFileTreeNode[];
  file?: CodeChangeFileSummary;
}

function createDirectoryNode(name: string, path: string): CodeChangeFileTreeNode {
  return {
    id: `dir:${path}`,
    name,
    path,
    type: "directory",
    additions: 0,
    deletions: 0,
    files: 0,
    children: [],
  };
}

function createFileNode(file: CodeChangeFileSummary): CodeChangeFileTreeNode {
  return {
    id: `file:${file.path}`,
    name: file.path.split("/").at(-1) ?? file.path,
    path: file.path,
    type: "file",
    additions: file.additions,
    deletions: file.deletions,
    files: 1,
    children: [],
    file,
  };
}

function getDirectoryChild(
  parent: CodeChangeFileTreeNode,
  name: string,
  path: string
): CodeChangeFileTreeNode {
  const existing = parent.children.find(
    (child) => child.type === "directory" && child.name === name
  );
  if (existing) {
    return existing;
  }

  const child = createDirectoryNode(name, path);
  parent.children.push(child);
  return child;
}

function sortTree(node: CodeChangeFileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

  for (const child of node.children) {
    sortTree(child);
  }
}

function compactDirectory(node: CodeChangeFileTreeNode): CodeChangeFileTreeNode {
  if (node.type === "file") {
    return node;
  }

  node.children = node.children.map(compactDirectory);

  while (node.children.length === 1 && node.children[0]?.type === "directory") {
    const child = node.children[0];
    node.name = node.name ? `${node.name}/${child.name}` : child.name;
    node.path = child.path;
    node.id = `dir:${node.path}`;
    node.children = child.children;
  }

  return node;
}

function addTotals(node: CodeChangeFileTreeNode): CodeChangeFileTreeNode {
  if (node.type === "file") {
    return node;
  }

  let additions = 0;
  let deletions = 0;
  let files = 0;

  for (const child of node.children) {
    addTotals(child);
    additions += child.additions;
    deletions += child.deletions;
    files += child.files;
  }

  node.additions = additions;
  node.deletions = deletions;
  node.files = files;
  return node;
}

export function buildCodeChangeFileTree(files: CodeChangeFileSummary[]): CodeChangeFileTreeNode[] {
  const root = createDirectoryNode("", "");

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index] ?? "";
      const path = parts.slice(0, index + 1).join("/");
      current = getDirectoryChild(current, name, path);
    }

    current.children.push(createFileNode(file));
  }

  addTotals(root);
  sortTree(root);
  return root.children.map(compactDirectory);
}
