import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "../Toast";
import { CopyableTag } from "./CopyableTag";

describe("CopyableTag", () => {
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

  function renderTag(ui: ReactElement) {
    return render(<ToastProvider>{ui}</ToastProvider>);
  }

  it("copies the tag when the user clicks it", async () => {
    renderTag(<CopyableTag tag="frontend" />);

    const pill = screen.getByRole("button", { name: /copy tag frontend/i });
    fireEvent.click(pill);

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(writeTextSpy).toHaveBeenCalledWith("frontend");
  });

  it("copies the tag when the user presses Space or Enter while focused", async () => {
    renderTag(<CopyableTag tag="backend" />);

    const pill = screen.getByRole("button", { name: /copy tag backend/i });
    pill.focus();
    fireEvent.keyDown(pill, { key: " ", code: "Space" });

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(writeTextSpy).toHaveBeenCalledWith("backend");

    writeTextSpy.mockClear();
    fireEvent.keyDown(pill, { key: "Enter", code: "Enter" });
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(writeTextSpy).toHaveBeenCalledWith("backend");
  });

  it("invokes onCopy after a successful copy", async () => {
    const onCopy = vi.fn();
    renderTag(<CopyableTag tag="api" onCopy={onCopy} />);

    fireEvent.click(screen.getByRole("button", { name: /copy tag api/i }));

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(onCopy).toHaveBeenCalledWith("api");
  });

  it("skips copy when onKeyDown calls preventDefault", () => {
    renderTag(
      <CopyableTag
        tag="blocked"
        onKeyDown={(e) => {
          e.preventDefault();
        }}
      />
    );

    const pill = screen.getByRole("button", { name: /copy tag blocked/i });
    pill.focus();
    fireEvent.keyDown(pill, { key: "Enter", code: "Enter" });

    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
    expect(writeTextSpy).not.toHaveBeenCalled();
  });
});
