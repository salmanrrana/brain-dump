import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "../Toast";
import { TicketTags } from "./TicketTags";

describe("TicketTags", () => {
  let writeTextSpy: MockInstance<(text: string) => Promise<void>>;

  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        writable: true,
        value: { writeText: vi.fn() },
      });
    }
    writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  });

  afterEach(() => {
    writeTextSpy.mockRestore();
  });

  function renderWithToast(ui: ReactElement) {
    return render(<ToastProvider>{ui}</ToastProvider>);
  }

  it("does not bubble tag clicks to a parent card handler", async () => {
    const parentClick = vi.fn();
    renderWithToast(
      <div onClick={parentClick}>
        <TicketTags tags={["alpha", "beta"]} />
      </div>
    );

    const alpha = screen.getByRole("button", { name: /copy tag alpha/i });
    fireEvent.click(alpha);

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(writeTextSpy).toHaveBeenCalledWith("alpha");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("does not bubble Enter on a tag to a parent key handler", async () => {
    const parentKeyDown = vi.fn();
    renderWithToast(
      <div onKeyDown={parentKeyDown}>
        <TicketTags tags={["gamma"]} />
      </div>
    );

    const gamma = screen.getByRole("button", { name: /copy tag gamma/i });
    gamma.focus();
    fireEvent.keyDown(gamma, { key: "Enter", code: "Enter" });

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});
