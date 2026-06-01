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

function arrowRight(): KeyboardEvent {
  return { key: "ArrowRight", preventDefault: () => {} } as unknown as KeyboardEvent;
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

describe("useBoardKeyboardNavigation roving tabindex", () => {
  // `rovingTabStopId` is the single card that's reachable with Tab (tabIndex=0).
  // It must follow keyboard focus so a screen-reader/keyboard user always lands
  // on, then Tabs out of, the card they last navigated to. The board uses it to
  // re-render only the affected cards, so getting this value right is what keeps
  // both accessibility and render isolation correct.
  it("makes the first card Tab-reachable until focus moves, then follows the focused card", () => {
    const { result } = renderHook(() => useBoardKeyboardNavigation({ ticketsByStatus }));

    // Nothing focused yet: the very first card is the keyboard entry point so a
    // user can Tab into the board.
    expect(result.current.focusedTicketId).toBeNull();
    expect(result.current.rovingTabStopId).toBe("a");

    // After navigating, the focused card becomes the Tab-reachable card.
    act(() => result.current.handleKeyDown(arrowDown()));
    expect(result.current.focusedTicketId).toBe("a");
    expect(result.current.rovingTabStopId).toBe("a");

    act(() => result.current.handleKeyDown(arrowDown()));
    expect(result.current.focusedTicketId).toBe("b");
    expect(result.current.rovingTabStopId).toBe("b");
  });

  it("moves the Tab-reachable card across columns with ArrowRight", () => {
    const multiColumn = {
      backlog: [makeTicket("a", "backlog"), makeTicket("b", "backlog")],
      ready: [makeTicket("c", "ready")],
      in_progress: [],
      ai_review: [],
      human_review: [],
      done: [],
    } as Record<TicketStatus, TicketSummary[]>;

    const { result } = renderHook(() =>
      useBoardKeyboardNavigation({ ticketsByStatus: multiColumn })
    );

    // Focus the first backlog card, then cross into the ready column.
    act(() => result.current.handleKeyDown(arrowDown()));
    expect(result.current.rovingTabStopId).toBe("a");

    act(() => result.current.handleKeyDown(arrowRight()));
    expect(result.current.focusedTicketId).toBe("c");
    expect(result.current.rovingTabStopId).toBe("c");
  });

  it("drops the tab stop to null when the board has no tickets", () => {
    const empty = {
      backlog: [],
      ready: [],
      in_progress: [],
      ai_review: [],
      human_review: [],
      done: [],
    } as Record<TicketStatus, TicketSummary[]>;

    const { result } = renderHook(() => useBoardKeyboardNavigation({ ticketsByStatus: empty }));

    expect(result.current.rovingTabStopId).toBeNull();
  });
});
