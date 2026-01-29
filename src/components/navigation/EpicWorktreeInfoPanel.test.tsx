import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicWorktreeInfoPanel } from "./EpicWorktreeInfoPanel";

describe("EpicWorktreeInfoPanel", () => {
  it("renders nothing when isolation mode is not worktree", () => {
    const { container } = render(
      <EpicWorktreeInfoPanel epicTitle="Test Epic" isolationMode="branch" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when isolation mode is null", () => {
    const { container } = render(
      <EpicWorktreeInfoPanel epicTitle="Test Epic" isolationMode={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders worktree info panel when isolation mode is worktree", () => {
    render(
      <EpicWorktreeInfoPanel
        epicTitle="Git Worktree Integration"
        isolationMode="worktree"
        worktreePath="/Users/test/project-epic-worktree"
        worktreeStatus="active"
      />
    );

    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-label",
      "Worktree information for Git Worktree Integration"
    );
    expect(screen.getByText("Worktree")).toBeInTheDocument();
    expect(screen.getByText("/Users/test/project-epic-worktree")).toBeInTheDocument();
  });

  it("shows creation date when provided", () => {
    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreeCreatedAt="2026-01-15T10:00:00Z"
      />
    );

    // Date should be formatted - exact format depends on locale
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it("calls onOpenInIDE when Open in IDE button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenInIDE = vi.fn();

    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreePath="/test/path"
        onOpenInIDE={onOpenInIDE}
      />
    );

    await user.click(screen.getByRole("button", { name: /open.*ide/i }));
    expect(onOpenInIDE).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenTerminal when Terminal button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenTerminal = vi.fn();

    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreePath="/test/path"
        onOpenTerminal={onOpenTerminal}
      />
    );

    await user.click(screen.getByRole("button", { name: /terminal/i }));
    expect(onOpenTerminal).toHaveBeenCalledTimes(1);
  });

  it("enables cleanup button for stale worktrees", async () => {
    const user = userEvent.setup();
    const onCleanup = vi.fn();

    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreeStatus="stale"
        onCleanup={onCleanup}
      />
    );

    const cleanupButton = screen.getByRole("button", { name: /cleanup/i });
    expect(cleanupButton).not.toBeDisabled();

    await user.click(cleanupButton);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it("enables cleanup button for orphaned worktrees", () => {
    const onCleanup = vi.fn();

    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreeStatus="orphaned"
        onCleanup={onCleanup}
      />
    );

    const cleanupButton = screen.getByRole("button", { name: /cleanup/i });
    expect(cleanupButton).not.toBeDisabled();
  });

  it("disables cleanup button for active worktrees", async () => {
    const user = userEvent.setup();
    const onCleanup = vi.fn();

    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreeStatus="active"
        onCleanup={onCleanup}
      />
    );

    const cleanupButton = screen.getByRole("button", { name: /cleanup/i });
    expect(cleanupButton).toBeDisabled();

    // Clicking disabled button should not call handler
    await user.click(cleanupButton);
    expect(onCleanup).not.toHaveBeenCalled();
  });

  it("does not render action buttons when handlers are not provided", () => {
    render(
      <EpicWorktreeInfoPanel
        epicTitle="Test Epic"
        isolationMode="worktree"
        worktreePath="/test/path"
      />
    );

    expect(screen.queryByRole("button", { name: /open.*ide/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /terminal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cleanup/i })).not.toBeInTheDocument();
  });
});
