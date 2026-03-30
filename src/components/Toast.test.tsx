import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function TriggerToast() {
  const { showToast } = useToast();

  return (
    <button onClick={() => showToast("success", "Toast should stay fully visible at the bottom")}>
      Show Toast
    </button>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the notification container through a portal attached to document.body", () => {
    render(
      <ToastProvider>
        <TriggerToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Show Toast"));

    const container = screen.getByTestId("toast-container");
    expect(container.parentElement).toBe(document.body);
    expect(container).toHaveStyle({
      position: "fixed",
      left: "max(1rem, env(safe-area-inset-left))",
      right: "max(1rem, env(safe-area-inset-right))",
      bottom: "max(1rem, env(safe-area-inset-bottom))",
      pointerEvents: "none",
    });
  });

  it("constrains toast width so messages remain readable within the viewport", () => {
    render(
      <ToastProvider>
        <TriggerToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Show Toast"));

    const toast = screen.getByRole("status");
    expect(toast).toHaveStyle({ width: "min(32rem, 100%)" });
    expect(screen.getByText("Toast should stay fully visible at the bottom")).toHaveClass(
      "break-words"
    );
  });
});
