import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorktreeBadge } from "./WorktreeBadge";

describe("WorktreeBadge", () => {
  describe("when isolationMode is null", () => {
    it("renders nothing", () => {
      const { container } = render(<WorktreeBadge isolationMode={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("when isolationMode is 'branch'", () => {
    it("displays branch badge with correct text", () => {
      render(<WorktreeBadge isolationMode="branch" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("branch")).toBeInTheDocument();
    });

    it("shows tooltip explaining branch mode", () => {
      render(<WorktreeBadge isolationMode="branch" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("title", "Working in main repository using git branches");
    });

    it("has correct aria-label for accessibility", () => {
      render(<WorktreeBadge isolationMode="branch" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label", "Isolation mode: branch");
    });
  });

  describe("when isolationMode is 'worktree'", () => {
    it("displays worktree badge with status label", () => {
      render(<WorktreeBadge isolationMode="worktree" worktreeStatus="active" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("worktree")).toBeInTheDocument();
    });

    it("defaults to active status when worktreeStatus is undefined", () => {
      render(<WorktreeBadge isolationMode="worktree" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label", "Isolation mode: worktree, status: active");
    });

    it("shows status in label for stale worktrees", () => {
      render(<WorktreeBadge isolationMode="worktree" worktreeStatus="stale" />);

      expect(screen.getByText("worktree (stale)")).toBeInTheDocument();
    });

    it("shows status in label for orphaned worktrees", () => {
      render(<WorktreeBadge isolationMode="worktree" worktreeStatus="orphaned" />);

      expect(screen.getByText("worktree (orphaned)")).toBeInTheDocument();
    });

    it("includes worktree path in tooltip when provided", () => {
      render(
        <WorktreeBadge
          isolationMode="worktree"
          worktreeStatus="active"
          worktreePath="/home/user/project-epic-xyz"
        />
      );

      const badge = screen.getByRole("status");
      expect(badge.getAttribute("title")).toContain("/home/user/project-epic-xyz");
    });

    it("includes cleanup hint in tooltip for stale worktrees", () => {
      render(<WorktreeBadge isolationMode="worktree" worktreeStatus="stale" />);

      const badge = screen.getByRole("status");
      expect(badge.getAttribute("title")).toContain("Safe to clean up");
    });

    it("includes attention hint in tooltip for orphaned worktrees", () => {
      render(<WorktreeBadge isolationMode="worktree" worktreeStatus="orphaned" />);

      const badge = screen.getByRole("status");
      expect(badge.getAttribute("title")).toContain("needs attention");
    });

    it("has correct aria-label for worktree status", () => {
      render(<WorktreeBadge isolationMode="worktree" worktreeStatus="stale" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label", "Isolation mode: worktree, status: stale");
    });
  });

  describe("size variants", () => {
    it("renders with sm size by default", () => {
      render(<WorktreeBadge isolationMode="branch" />);

      const badge = screen.getByRole("status");
      expect(badge.className).toContain("text-[10px]");
    });

    it("renders with md size when specified", () => {
      render(<WorktreeBadge isolationMode="branch" size="md" />);

      const badge = screen.getByRole("status");
      expect(badge.className).toContain("text-xs");
    });
  });

  describe("accessibility", () => {
    it("has role=status for screen readers", () => {
      render(<WorktreeBadge isolationMode="worktree" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("hides icon from screen readers", () => {
      const { container } = render(<WorktreeBadge isolationMode="branch" />);

      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });
});
