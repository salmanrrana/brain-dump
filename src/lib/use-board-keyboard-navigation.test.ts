import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { KeyboardEvent } from "react";
import { useBoardKeyboardNavigation } from "./use-board-keyboard-navigation";
import type { TicketStatus, TicketSummary } from "../api/tickets";

function makeTicket(id: string, status: TicketStatus): TicketSummary {
  return { id, title: `Ticket ${id}`, status, position: 0 } as unknown as TicketSummary;
}

const ticketsByStatus = {
  backlog: [makeTicket("a", "backlog"), makeTicket("b", "backlog")],
  ready: [],
  in_progress: [],
  ai_review: [],
  human_review: [],
  done: [],
} as Record<TicketStatus, TicketSummary[]>;

function arrowDown(): KeyboardEvent {
  return { key: "ArrowDown", preventDefault: () => {} } as unknown as KeyboardEvent;
}

describe("useBoardKeyboardNavigation drag gating", () => {
  // The board passes an isDraggingRef so that arrow-key navigation is suppressed
  // while a card is being dragged (otherwise keyboard nav fights dnd-kit's
  // keyboard sensor). This verifies the user-visible behavior: focus moves on
  // ArrowDown normally, stays put during a drag, and resumes once the drag ends.
  it("moves focus on ArrowDown, ignores it while dragging, and resumes after the drag ends", () => {
    const disabledRef = { current: false };
    const { result } = renderHook(() =>
      useBoardKeyboardNavigation({ ticketsByStatus, disabledRef })
    );

    expect(result.current.focusedTicketId).toBeNull();

    // Not dragging: ArrowDown focuses the first card in the column.
    act(() => result.current.handleKeyDown(arrowDown()));
    expect(result.current.focusedTicketId).toBe("a");

    // Drag in progress: arrow keys are ignored, so focus does not move.
    disabledRef.current = true;
    act(() => result.current.handleKeyDown(arrowDown()));
    expect(result.current.focusedTicketId).toBe("a");

    // Drag ended/cancelled (ref reset): navigation works again.
    disabledRef.current = false;
    act(() => result.current.handleKeyDown(arrowDown()));
    expect(result.current.focusedTicketId).toBe("b");
  });
});
