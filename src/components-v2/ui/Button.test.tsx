import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

function MockIcon({ testId = "mock-icon" }: { testId?: string }) {
  return <span data-testid={testId}>icon</span>;
}

describe("Button", () => {
  describe("User interactions", () => {
    it("fires onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Click Me</Button>);
      await user.click(screen.getByRole("button", { name: "Click Me" }));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not fire onClick when disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>
      );
      await user.click(screen.getByRole("button", { name: "Disabled" }));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("does not fire onClick when loading", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <Button onClick={handleClick} isLoading>
          Loading
        </Button>
      );
      await user.click(screen.getByRole("button", { name: "Loading" }));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("Loading state", () => {
    it("shows spinner and disables button when loading", () => {
      render(<Button isLoading>Loading</Button>);

      const button = screen.getByRole("button", { name: "Loading" });
      expect(button).toBeDisabled();
      expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();
    });

    it("replaces left icon with spinner when loading", () => {
      render(
        <Button isLoading iconLeft={<MockIcon testId="left-icon" />}>
          Loading
        </Button>
      );

      expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument();
      expect(screen.getByRole("button").querySelector("svg.animate-spin")).toBeInTheDocument();
    });
  });

  describe("Icons", () => {
    it("renders left and right icons", () => {
      render(
        <Button
          iconLeft={<MockIcon testId="left-icon" />}
          iconRight={<MockIcon testId="right-icon" />}
        >
          With Icons
        </Button>
      );

      expect(screen.getByTestId("left-icon")).toBeInTheDocument();
      expect(screen.getByTestId("right-icon")).toBeInTheDocument();
    });
  });

  describe("Keyboard accessibility", () => {
    it("is focusable and activates with Enter", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Press Enter</Button>);

      await user.tab();
      expect(screen.getByRole("button")).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("activates with Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Press Space</Button>);

      await user.tab();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Variants and states", () => {
    it("supports all variants", () => {
      const { rerender } = render(<Button variant="primary">Test</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-variant", "primary");

      rerender(<Button variant="secondary">Test</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-variant", "secondary");

      rerender(<Button variant="ghost">Test</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-variant", "ghost");

      rerender(<Button variant="danger">Test</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-variant", "danger");
    });

    it("applies disabled styling", () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveStyle({ opacity: "0.5", cursor: "not-allowed" });
    });
  });

  describe("Props", () => {
    it("forwards ref to button element", () => {
      const ref = vi.fn();
      render(<Button ref={ref}>Test</Button>);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLButtonElement);
    });

    it("accepts type and form attributes", () => {
      render(
        <Button type="submit" form="my-form">
          Submit
        </Button>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "submit");
      expect(button).toHaveAttribute("form", "my-form");
    });
  });
});
