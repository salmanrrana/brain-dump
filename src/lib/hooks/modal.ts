/**
 * Modal state management hook using discriminated unions.
 * Provides type-safe modal management replacing multiple useState calls.
 */

import { useCallback, useState } from "react";

// =============================================================================
// MODAL STATE TYPES
// =============================================================================

/**
 * Modal state type - discriminated union for type-safe modal management
 */
export type ModalState =
  | { type: "none" }
  | { type: "newTicket" }
  | {
      type: "project";
      project: {
        id: string;
        name: string;
        path: string;
        color: string | null;
        workingMethod: string | null;
      } | null;
    }
  | {
      type: "epic";
      projectId: string;
      epic: {
        id: string;
        title: string;
        description: string | null;
        projectId: string;
        color: string | null;
        createdAt: string;
      } | null;
    }
  | { type: "settings" }
  | { type: "shortcuts" };

export interface UseModalReturn {
  modal: ModalState;
  openNewTicket: () => void;
  openProject: (project?: {
    id: string;
    name: string;
    path: string;
    color: string | null;
    workingMethod: string | null;
  }) => void;
  openEpic: (
    projectId: string,
    epic?: {
      id: string;
      title: string;
      description: string | null;
      projectId: string;
      color: string | null;
      createdAt: string;
    }
  ) => void;
  openSettings: () => void;
  openShortcuts: () => void;
  close: () => void;
  isAnyOpen: boolean;
}

// =============================================================================
// MODAL HOOK
// =============================================================================

/**
 * Hook for managing modal state with a discriminated union
 * Replaces 8 separate useState calls with a single state variable
 */
export function useModal(): UseModalReturn {
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const openNewTicket = useCallback(() => {
    setModal({ type: "newTicket" });
  }, []);

  const openProject = useCallback(
    (project?: {
      id: string;
      name: string;
      path: string;
      color: string | null;
      workingMethod: string | null;
    }) => {
      setModal({ type: "project", project: project ?? null });
    },
    []
  );

  const openEpic = useCallback(
    (
      projectId: string,
      epic?: {
        id: string;
        title: string;
        description: string | null;
        projectId: string;
        color: string | null;
        createdAt: string;
      }
    ) => {
      setModal({ type: "epic", projectId, epic: epic ?? null });
    },
    []
  );

  const openSettings = useCallback(() => {
    setModal({ type: "settings" });
  }, []);

  const openShortcuts = useCallback(() => {
    setModal({ type: "shortcuts" });
  }, []);

  const close = useCallback(() => {
    setModal({ type: "none" });
  }, []);

  const isAnyOpen = modal.type !== "none";

  return {
    modal,
    openNewTicket,
    openProject,
    openEpic,
    openSettings,
    openShortcuts,
    close,
    isAnyOpen,
  };
}
