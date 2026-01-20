import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { Modal } from "./Modal";

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <p data-testid="modal-content">Modal content</p>,
    ...props,
  };

  const result = render(<Modal {...defaultProps} />);
  return { ...result, onClose: defaultProps.onClose };
}

describe("Modal", () => {
  describe("Rendering", () => {
    it("renders when open and hides when closed", () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <p>Content</p>
        </Modal>
      );
      expect(screen.getByText("Content")).toBeInTheDocument();

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          <p>Content</p>
        </Modal>
      );
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("renders as portal to body", () => {
      renderModal();
      expect(screen.getByTestId("modal-overlay").parentElement).toBe(document.body);
    });

    it("supports size variants", () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}} size="sm">
          Content
        </Modal>
      );
      expect(screen.getByTestId("modal-container")).toHaveAttribute("data-size", "sm");

      rerender(
        <Modal isOpen={true} onClose={() => {}} size="xl">
          Content
        </Modal>
      );
      expect(screen.getByTestId("modal-container")).toHaveAttribute("data-size", "xl");
    });
  });

  describe("Closing behavior", () => {
    it("closes on Escape key", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on overlay click", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByTestId("modal-overlay"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close on modal content click", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByTestId("modal-container"));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("respects closeOnOverlayClick=false", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal({ closeOnOverlayClick: false });

      await user.click(screen.getByTestId("modal-overlay"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Focus management", () => {
    it("focuses first focusable element on open", async () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <button data-testid="btn-1">First</button>
          <button data-testid="btn-2">Second</button>
        </Modal>
      );

      await waitFor(() => {
        expect(screen.getByTestId("btn-1")).toHaveFocus();
      });
    });

    it("traps focus within modal", async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={() => {}}>
          <button data-testid="btn-1">First</button>
          <button data-testid="btn-2">Second</button>
        </Modal>
      );

      await waitFor(() => {
        expect(screen.getByTestId("btn-1")).toHaveFocus();
      });

      await user.tab();
      expect(screen.getByTestId("btn-2")).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId("btn-1")).toHaveFocus(); // Wraps around
    });

    it("restores focus when closed", async () => {
      const button = document.createElement("button");
      button.setAttribute("data-testid", "trigger-button");
      document.body.appendChild(button);
      button.focus();

      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <input type="text" />
        </Modal>
      );

      await waitFor(() => {
        expect(button).not.toHaveFocus();
      });

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          <input type="text" />
        </Modal>
      );

      await waitFor(() => {
        expect(button).toHaveFocus();
      });

      button.remove();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA attributes", () => {
      renderModal({ "aria-label": "Test modal" });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-label", "Test modal");
    });

    it("prevents body scroll when open", () => {
      const { unmount } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );

      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });
  });
});

describe("Modal.Header", () => {
  it("renders title and close button", () => {
    render(
      <Modal isOpen={true} onClose={() => {}}>
        <Modal.Header icon={Plus} title="Create Item" onClose={() => {}} />
      </Modal>
    );

    expect(screen.getByRole("heading", { name: "Create Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close modal" })).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={() => {}}>
        <Modal.Header icon={Plus} title="Test" onClose={onClose} />
      </Modal>
    );

    await user.click(screen.getByTestId("modal-close-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("works without icon", () => {
    render(
      <Modal isOpen={true} onClose={() => {}}>
        <Modal.Header title="No Icon" onClose={() => {}} />
      </Modal>
    );

    expect(screen.getByText("No Icon")).toBeInTheDocument();
  });
});

describe("Modal.Body", () => {
  it("renders children with scrollable overflow", () => {
    render(
      <Modal isOpen={true} onClose={() => {}}>
        <Modal.Body>
          <p data-testid="body-content">Content</p>
        </Modal.Body>
      </Modal>
    );

    expect(screen.getByTestId("body-content")).toBeInTheDocument();
    expect(screen.getByTestId("modal-body")).toHaveStyle({ overflowY: "auto" });
  });
});

describe("Modal.Footer", () => {
  it("renders children with alignment options", () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}}>
        <Modal.Footer>
          <button>Save</button>
        </Modal.Footer>
      </Modal>
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByTestId("modal-footer")).toHaveStyle({ justifyContent: "flex-end" });

    rerender(
      <Modal isOpen={true} onClose={() => {}}>
        <Modal.Footer align="left">
          <button>Delete</button>
        </Modal.Footer>
      </Modal>
    );

    expect(screen.getByTestId("modal-footer")).toHaveStyle({ justifyContent: "flex-start" });
  });
});

describe("Modal compound components", () => {
  it("maintains tab order across header, body, footer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={onClose}>
        <Modal.Header icon={Plus} title="Test" onClose={onClose} />
        <Modal.Body>
          <input data-testid="input" type="text" />
        </Modal.Body>
        <Modal.Footer>
          <button data-testid="save-btn">Save</button>
        </Modal.Footer>
      </Modal>
    );

    await waitFor(() => {
      expect(screen.getByTestId("modal-close-button")).toHaveFocus();
    });

    await user.tab();
    expect(screen.getByTestId("input")).toHaveFocus();

    await user.tab();
    expect(screen.getByTestId("save-btn")).toHaveFocus();

    await user.tab();
    expect(screen.getByTestId("modal-close-button")).toHaveFocus();
  });
});
