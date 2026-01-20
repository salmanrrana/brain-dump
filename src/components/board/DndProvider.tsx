import type { FC, ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type Announcements,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export interface DndProviderProps {
  /** Content to render (typically KanbanBoard) */
  children: ReactNode;
  /** Callback when drag starts (optional) */
  onDragStart?: (event: DragStartEvent) => void;
  /** Callback when dragging over a droppable area (optional) */
  onDragOver?: (event: DragOverEvent) => void;
  /** Callback when drag ends (required for status updates) */
  onDragEnd: (event: DragEndEvent) => void;
  /** Callback when drag is canceled (optional) */
  onDragCancel?: () => void;
}

/**
 * Accessibility announcements for drag-and-drop operations.
 * These are read by screen readers to provide context during drag operations.
 */
const announcements: Announcements = {
  onDragStart() {
    return `Picked up ticket. Press space to drop, or escape to cancel.`;
  },
  onDragOver({ over }) {
    if (over) {
      const overStatus = over.data.current?.status as string | undefined;
      if (overStatus) {
        return `Ticket is now over the ${overStatus.replace("_", " ")} column.`;
      }
      return `Ticket is over a drop zone.`;
    }
    return `Ticket is no longer over a drop zone.`;
  },
  onDragEnd({ over }) {
    if (over) {
      const overStatus = over.data.current?.status as string | undefined;
      if (overStatus) {
        return `Ticket dropped in ${overStatus.replace("_", " ")} column.`;
      }
      return `Ticket was dropped.`;
    }
    return `Ticket was dropped outside of a drop zone. No changes made.`;
  },
  onDragCancel() {
    return `Drag cancelled. Ticket returned to original position.`;
  },
};

/**
 * DndProvider - Context provider for @dnd-kit drag-and-drop functionality.
 *
 * Features:
 * - Wraps children with DndContext for drag-and-drop capability
 * - Configures sensors for pointer and keyboard input
 * - Uses closestCorners collision detection for accurate drop detection
 * - Provides accessibility announcements for screen readers
 * - Exposes drag lifecycle callbacks (start, over, end, cancel)
 *
 * Usage:
 * ```tsx
 * <DndProvider onDragEnd={handleDragEnd}>
 *   <KanbanBoard />
 * </DndProvider>
 * ```
 *
 * The onDragEnd handler receives a DragEndEvent with:
 * - active.id: The dragged ticket's ID
 * - over?.id: The drop target's ID (column status)
 * - over?.data.current?.status: The target column's status
 *
 * @see https://docs.dndkit.com/api-documentation/context-provider
 */
export const DndProvider: FC<DndProviderProps> = ({
  children,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
}) => {
  // Configure sensors for different input methods
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a small drag distance before activating
      // This prevents accidental drags when clicking
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      // Use sortable keyboard coordinates for intuitive arrow key navigation
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
      {...(onDragStart ? { onDragStart } : {})}
      {...(onDragOver ? { onDragOver } : {})}
      {...(onDragCancel ? { onDragCancel } : {})}
      accessibility={{
        announcements,
        // Screen reader instructions for the draggable items
        screenReaderInstructions: {
          draggable: `
            To pick up a ticket, press space or enter.
            While dragging, use the arrow keys to move the ticket.
            Press space or enter again to drop the ticket in its new position,
            or press escape to cancel.
          `,
        },
      }}
    >
      {children}
    </DndContext>
  );
};

export default DndProvider;
