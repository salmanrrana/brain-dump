import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AttachmentTypeModal from "./AttachmentTypeModal";

describe("AttachmentTypeModal", () => {
  it("does not offer runner-only verification evidence types for manual uploads", () => {
    render(
      <AttachmentTypeModal
        filename="verification-screenshot.png"
        isImage={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText("Verification Evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("Verification Screenshot")).not.toBeInTheDocument();
    expect(screen.queryByText("API Evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("Verification Manifest")).not.toBeInTheDocument();
  });

  it("falls back to a user-writable type for verification-looking filenames", () => {
    const onConfirm = vi.fn();
    render(
      <AttachmentTypeModal
        filename="verification-manifest.json"
        isImage={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(onConfirm).toHaveBeenCalledWith({ type: "reference", priority: "primary" });
  });
});
