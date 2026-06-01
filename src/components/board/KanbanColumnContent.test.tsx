import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KanbanColumnContent } from "./KanbanColumnContent";
import type { TicketSummary } from "../../api/tickets";

const dndMocks = vi.hoisted(() => {
  const state = {
    latestMonitor: null as {
      onDragStart?: (event: { active: { id: string } }) => void;
      onDragEnd?: () => void;
      onDragCancel?: () => void;
    } | null,
  };

  return {
    state,
    useDndMonitorMock: vi.fn((monitor: typeof state.latestMonitor) => {
      state.latestMonitor = monitor;
    }),
  };
});

const virtualMocks = vi.hoisted(() => ({
  useVirtualizerMock: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  useDndMonitor: dndMocks.useDndMonitorMock,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

vi.mock("@tanstack/react-virtual", () => ({
  defaultRangeExtractor: ({
    startIndex,
    endIndex,
    overscan,
    count,
  }: {
    startIndex: number;
    endIndex: number;
    overscan: number;
    count: number;
  }) => {
    const indexes: number[] = [];
    for (
      let index = Math.max(startIndex - overscan, 0);
      index <= Math.min(endIndex + overscan, count - 1);
      index += 1
    ) {
      indexes.push(index);
    }
    return indexes;
  },
  useVirtualizer: virtualMocks.useVirtualizerMock,
}));

vi.mock("./SortableTicketCard", () => ({
  SortableTicketCard: ({
    ticket,
    tabIndex,
    isFocused,
  }: {
    ticket: TicketSummary;
    tabIndex: 0 | -1;
    isFocused: boolean;
  }) => (
    <button
      data-testid={`ticket-${ticket.id}`}
      data-focused={isFocused ? "true" : "false"}
      tabIndex={tabIndex}
    >
      {ticket.title}
    </button>
  ),
}));

function makeTicket(index: number): TicketSummary {
  return {
    id: `ticket-${index}`,
    title: `Ticket ${index}`,
    status: "backlog",
    priority: "medium",
    position: index,
  } as TicketSummary;
}

function renderContent({
  ticketCount,
  focusedTicketId = null,
  tabStopTicketId = "ticket-0",
}: {
  ticketCount: number;
  focusedTicketId?: string | null;
  tabStopTicketId?: string | null;
}) {
  const tickets = Array.from({ length: ticketCount }, (_, index) => makeTicket(index));
  const ticketIds = tickets.map((ticket) => ticket.id);
  const scrollContainer = document.createElement("div");

  return render(
    <KanbanColumnContent
      scrollContainer={scrollContainer}
      ticketIds={ticketIds}
      tickets={tickets}
      focusedTicketId={focusedTicketId}
      tabStopTicketId={tabStopTicketId}
      registerCardRef={() => () => {}}
      onCardFocus={() => {}}
    />
  );
}

describe("KanbanColumnContent virtualization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dndMocks.state.latestMonitor = null;
    virtualMocks.useVirtualizerMock.mockImplementation(
      ({
        count,
        enabled,
        getItemKey,
        rangeExtractor,
      }: {
        count: number;
        enabled: boolean;
        getItemKey: (index: number) => string | number;
        rangeExtractor: (range: {
          startIndex: number;
          endIndex: number;
          overscan: number;
          count: number;
        }) => number[];
      }) => {
        const indexes = enabled
          ? rangeExtractor({ startIndex: 0, endIndex: 2, overscan: 0, count })
          : [];

        return {
          getVirtualItems: () =>
            indexes.map((index) => ({
              key: getItemKey(index),
              index,
              start: index * 100,
              size: 100,
              end: (index + 1) * 100,
            })),
          getTotalSize: () => count * 100,
          measureElement: vi.fn(),
        };
      }
    );
  });

  it("renders every card for small columns without the virtualized list wrapper", () => {
    renderContent({ ticketCount: 3 });

    expect(screen.queryByTestId("kanban-virtual-list")).not.toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-0")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-1")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-2")).toBeInTheDocument();
  });

  it("renders only visible rows for large columns and keeps the dragged row mounted", () => {
    renderContent({ ticketCount: 25 });

    expect(screen.getByTestId("kanban-virtual-list")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-0")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-1")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-2")).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-ticket-10")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ticket-ticket-24")).not.toBeInTheDocument();

    act(() => {
      dndMocks.state.latestMonitor?.onDragStart?.({ active: { id: "ticket-24" } });
    });

    expect(screen.getByTestId("ticket-ticket-24")).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-ticket-10")).not.toBeInTheDocument();
    expect(virtualMocks.useVirtualizerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        getItemKey: expect.any(Function),
      })
    );
    const virtualizerOptions = virtualMocks.useVirtualizerMock.mock.calls.at(-1)?.[0];
    expect(virtualizerOptions.getItemKey(24)).toBe("ticket-24");
  });

  it("keeps the focused row mounted when keyboard navigation reaches an offscreen card", () => {
    renderContent({
      ticketCount: 25,
      focusedTicketId: "ticket-24",
      tabStopTicketId: "ticket-24",
    });

    expect(screen.getByTestId("ticket-ticket-24")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-ticket-24")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("ticket-ticket-24")).toHaveAttribute("data-focused", "true");
    expect(screen.queryByTestId("ticket-ticket-10")).not.toBeInTheDocument();
  });

  it("does not pin an unrelated dragged row into this virtualized column", () => {
    renderContent({ ticketCount: 25 });

    act(() => {
      dndMocks.state.latestMonitor?.onDragStart?.({ active: { id: "ticket-from-another-column" } });
    });

    expect(screen.queryByTestId("ticket-ticket-24")).not.toBeInTheDocument();
    expect(screen.queryByText("ticket-from-another-column")).not.toBeInTheDocument();
  });
});
