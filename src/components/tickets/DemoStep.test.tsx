import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DemoStep } from "./DemoStep";
import type { DemoStepType } from "./DemoStep";

function createStep(overrides: Partial<DemoStepType> = {}): DemoStepType {
  return {
    order: 1,
    description: "Open the ticket detail page",
    expectedOutcome: "The page loads",
    type: "manual",
    ...overrides,
  };
}

describe("DemoStep resilience", () => {
  it("renders a known step type with its badge", () => {
    render(
      <DemoStep
        step={createStep({ type: "visual" })}
        status="pending"
        onStatusChange={vi.fn()}
        onNotesChange={vi.fn()}
      />
    );

    expect(screen.getByText("Visual")).toBeInTheDocument();
    expect(screen.getByText("Open the ticket detail page")).toBeInTheDocument();
  });

  it("renders without crashing when the step type is unknown (legacy data)", () => {
    // Older demo scripts may persist a type/status outside the current enum.
    // The component must not throw "Cannot read properties of undefined".
    render(
      <DemoStep
        step={createStep({ type: "legacy-type" as DemoStepType["type"] })}
        status={"archived" as never}
        onStatusChange={vi.fn()}
        onNotesChange={vi.fn()}
      />
    );

    expect(screen.getByText("Step")).toBeInTheDocument();
    expect(screen.getByText("Open the ticket detail page")).toBeInTheDocument();
  });
});
