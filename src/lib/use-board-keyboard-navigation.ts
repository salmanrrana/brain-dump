import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { TicketSummary } from "../api/tickets";
import type { TicketStatus } from "../api/tickets";
import { COLUMN_STATUSES } from "./constants";
import { isInputFocused } from "./keyboard-utils";

// Use shared constant from constants.ts
const COLUMNS = COLUMN_STATUSES as unknown as TicketStatus[];

interface UseBoardKeyboardNavigationConfig {
  /** Tickets grouped by status column */
  ticketsByStatus: Record<TicketStatus, TicketSummary[]>;
  /** Callback when Enter is pressed on focused ticket */
  onTicketSelect?: ((ticket: TicketSummary) => void) | undefined;
  /** Whether keyboard navigation is disabled (e.g., modal open, input focused) */
  disabled?: boolean;
  /**
   * Ref-based disable flag, checked at keydown time. Lets callers disable
   * navigation (e.g. while a drag is in progress) WITHOUT triggering a
   * re-render of the board on every drag start/end. Refs are stable, so the
   * `handleKeyDown` identity stays put.
   */
  disabledRef?: RefObject<boolean> | undefined;
}

interface UseBoardKeyboardNavigationReturn {
  /** Currently focused ticket ID (null if none) */
  focusedTicketId: string | null;
  /** Set the focused ticket ID programmatically */
  setFocusedTicketId: (id: string | null) => void;
  /** Handler for keydown events on the board container */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /**
   * Ticket id that participates in the page tab order (roving tabindex pattern):
   * the focused card, or — when nothing is focused yet — the first card on the
   * board. Exposed as a stable string (not a fresh function on every focus move)
   * so consumers can scope it per column and re-render only the affected cards.
   */
  rovingTabStopId: string | null;
  /** Ref callback to register a ticket card element */
  registerCardRef: (ticketId: string) => (el: HTMLElement | null) => void;
  /** Handler for focus on a ticket card */
  handleCardFocus: (ticketId: string) => void;
}

// isInputFocused imported from keyboard-utils.ts

/**
 * Hook for roving tabindex keyboard navigation on the Kanban board.
 *
 * Implements WAI-ARIA roving tabindex pattern:
 * - Only one item in the group has tabIndex=0 (focusable with Tab)
 * - All other items have tabIndex=-1
 * - Arrow keys move focus between items
 * - Enter selects the focused item
 *
 * Navigation logic:
 * - Up/Down: Move within the same column
 * - Left/Right: Move to adjacent column (same row position or closest)
 * - Home: Move to first ticket
 * - End: Move to last ticket
 *
 * @example
 * ```tsx
 * const {
 *   focusedTicketId,
 *   handleKeyDown,
 *   rovingTabStopId,
 *   registerCardRef,
 *   handleCardFocus,
 * } = useBoardKeyboardNavigation({
 *   ticketsByStatus,
 *   onTicketSelect: (ticket) => openTicketDetail(ticket),
 * });
 * ```
 */
export function useBoardKeyboardNavigation(
  config: UseBoardKeyboardNavigationConfig
): UseBoardKeyboardNavigationReturn {
  const { ticketsByStatus, onTicketSelect, disabled = false, disabledRef } = config;

  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pendingFocusTicketId = useRef<string | null>(null);

  // Build a flat list of all tickets for navigation (useMemo caches the computed array)
  const allTickets = useMemo(() => {
    const tickets: { ticket: TicketSummary; column: TicketStatus; index: number }[] = [];
    for (const column of COLUMNS) {
      const columnTickets = ticketsByStatus[column] ?? [];
      columnTickets.forEach((ticket, index) => {
        tickets.push({ ticket, column, index });
      });
    }
    return tickets;
  }, [ticketsByStatus]);

  // Find the position of a ticket
  const findTicketPosition = useCallback(
    (ticketId: string) => {
      for (const column of COLUMNS) {
        const columnTickets = ticketsByStatus[column] ?? [];
        const index = columnTickets.findIndex((t) => t.id === ticketId);
        if (index !== -1) {
          return { column, index, ticket: columnTickets[index] };
        }
      }
      return null;
    },
    [ticketsByStatus]
  );

  // Get the column index
  const getColumnIndex = useCallback((column: TicketStatus): number => {
    return COLUMNS.indexOf(column);
  }, []);

  // Focus a ticket by ID
  const focusTicket = useCallback((ticketId: string) => {
    setFocusedTicketId(ticketId);
    const element = cardRefs.current.get(ticketId);
    if (element) {
      pendingFocusTicketId.current = null;
      element.focus();
      return;
    }
    pendingFocusTicketId.current = ticketId;
  }, []);

  // Navigate up within the same column
  const navigateUp = useCallback(() => {
    if (!focusedTicketId) {
      // Focus first ticket if nothing focused
      const tickets = allTickets;
      if (tickets.length > 0) {
        focusTicket(tickets[0]!.ticket.id);
      }
      return;
    }

    const pos = findTicketPosition(focusedTicketId);
    if (!pos) return;

    const columnTickets = ticketsByStatus[pos.column] ?? [];
    if (pos.index > 0) {
      // Move up within column
      focusTicket(columnTickets[pos.index - 1]!.id);
    }
  }, [focusedTicketId, findTicketPosition, ticketsByStatus, focusTicket, allTickets]);

  // Navigate down within the same column
  const navigateDown = useCallback(() => {
    if (!focusedTicketId) {
      const tickets = allTickets;
      if (tickets.length > 0) {
        focusTicket(tickets[0]!.ticket.id);
      }
      return;
    }

    const pos = findTicketPosition(focusedTicketId);
    if (!pos) return;

    const columnTickets = ticketsByStatus[pos.column] ?? [];
    if (pos.index < columnTickets.length - 1) {
      // Move down within column
      focusTicket(columnTickets[pos.index + 1]!.id);
    }
  }, [focusedTicketId, findTicketPosition, ticketsByStatus, focusTicket, allTickets]);

  // Navigate to adjacent column
  const navigateToColumn = useCallback(
    (direction: "left" | "right") => {
      if (!focusedTicketId) {
        const tickets = allTickets;
        if (tickets.length > 0) {
          focusTicket(tickets[0]!.ticket.id);
        }
        return;
      }

      const pos = findTicketPosition(focusedTicketId);
      if (!pos) return;

      const currentColumnIndex = getColumnIndex(pos.column);
      const targetColumnIndex =
        direction === "left" ? currentColumnIndex - 1 : currentColumnIndex + 1;

      // Check bounds
      if (targetColumnIndex < 0 || targetColumnIndex >= COLUMNS.length) return;

      // Find a non-empty column in the target direction
      let searchIndex = targetColumnIndex;
      while (searchIndex >= 0 && searchIndex < COLUMNS.length) {
        const targetColumn = COLUMNS[searchIndex]!;
        const targetColumnTickets = ticketsByStatus[targetColumn] ?? [];

        if (targetColumnTickets.length > 0) {
          // Target the same row index, or the last item if column is shorter
          const targetIndex = Math.min(pos.index, targetColumnTickets.length - 1);
          focusTicket(targetColumnTickets[targetIndex]!.id);
          return;
        }

        // Keep searching in the same direction
        searchIndex = direction === "left" ? searchIndex - 1 : searchIndex + 1;
      }
    },
    [focusedTicketId, findTicketPosition, getColumnIndex, ticketsByStatus, focusTicket, allTickets]
  );

  // Handle keydown on the board
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || disabledRef?.current || isInputFocused()) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          navigateUp();
          break;

        case "ArrowDown":
          e.preventDefault();
          navigateDown();
          break;

        case "ArrowLeft":
          e.preventDefault();
          navigateToColumn("left");
          break;

        case "ArrowRight":
          e.preventDefault();
          navigateToColumn("right");
          break;

        case "Home":
          e.preventDefault();
          {
            const tickets = allTickets;
            if (tickets.length > 0) {
              focusTicket(tickets[0]!.ticket.id);
            }
          }
          break;

        case "End":
          e.preventDefault();
          {
            const tickets = allTickets;
            if (tickets.length > 0) {
              focusTicket(tickets[tickets.length - 1]!.ticket.id);
            }
          }
          break;

        case "Enter":
        case " ":
          if (focusedTicketId) {
            e.preventDefault();
            const pos = findTicketPosition(focusedTicketId);
            if (pos && onTicketSelect) {
              onTicketSelect(pos.ticket!);
            }
          }
          break;
      }
    },
    [
      disabled,
      disabledRef,
      navigateUp,
      navigateDown,
      navigateToColumn,
      allTickets,
      focusTicket,
      focusedTicketId,
      findTicketPosition,
      onTicketSelect,
    ]
  );

  // Memoize the set of valid ticket IDs
  const validTicketIds = useMemo(() => {
    return new Set(allTickets.map((t) => t.ticket.id));
  }, [allTickets]);

  // Compute effective focused ticket ID - if current focused doesn't exist, use null
  // This avoids the setState-in-effect anti-pattern by computing instead of updating
  const effectiveFocusedTicketId = useMemo(() => {
    if (focusedTicketId && !validTicketIds.has(focusedTicketId)) {
      return null;
    }
    return focusedTicketId;
  }, [focusedTicketId, validTicketIds]);

  // Roving tabindex: exactly one card participates in the page tab order. That
  // is the focused card, or — when nothing is focused yet — the first card on
  // the board so keyboard users can Tab into the grid. A stable string (rather
  // than a fresh `getTabIndex` closure on every focus move) lets the board scope
  // it per column, so only the cards whose tab-stop/focus state changed re-render.
  //
  // The "first card" fallback uses `allTickets`, which is built in `COLUMNS`
  // order from the same `ticketsByStatus` the board renders. Consumers that
  // resolve which column owns this id MUST scope it using that same column
  // ordering, or the tab stop could land in the wrong column.
  const rovingTabStopId = useMemo(() => {
    if (effectiveFocusedTicketId) return effectiveFocusedTicketId;
    return allTickets[0]?.ticket.id ?? null;
  }, [effectiveFocusedTicketId, allTickets]);

  useEffect(() => {
    if (!effectiveFocusedTicketId) {
      pendingFocusTicketId.current = null;
      return;
    }

    if (pendingFocusTicketId.current !== effectiveFocusedTicketId) {
      return;
    }

    const element = cardRefs.current.get(effectiveFocusedTicketId);
    if (element) {
      pendingFocusTicketId.current = null;
      element.focus();
    }
  }, [effectiveFocusedTicketId]);

  // Register a card element ref
  const registerCardRef = useCallback(
    (ticketId: string) => (el: HTMLElement | null) => {
      if (el) {
        cardRefs.current.set(ticketId, el);
      } else {
        cardRefs.current.delete(ticketId);
      }
    },
    []
  );

  // Handle focus event on a card (for mouse/click focus)
  const handleCardFocus = useCallback((ticketId: string) => {
    setFocusedTicketId(ticketId);
  }, []);

  // Clean up refs when tickets change (only refs cleanup, no state changes)
  useEffect(() => {
    cardRefs.current.forEach((_, id) => {
      if (!validTicketIds.has(id)) {
        cardRefs.current.delete(id);
      }
    });
  }, [validTicketIds]);

  return {
    focusedTicketId: effectiveFocusedTicketId,
    setFocusedTicketId,
    handleKeyDown,
    rovingTabStopId,
    registerCardRef,
    handleCardFocus,
  };
}
