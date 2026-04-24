import { fireEvent, render, screen } from "@testing-library/react";
import { memo, ReactNode, useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AppFiltersContext,
  AppModalActionsContext,
  useAppFilters,
  useAppModalActions,
  type AppFiltersState,
  type AppModalActionsState,
} from "./AppLayoutContext";
import type { Filters } from "../lib/hooks";

const initialFilters: Filters = {
  projectId: null,
  epicId: null,
  tags: [],
};

const modalActions: AppModalActionsState = {
  openNewTicketModal: vi.fn(),
  openProjectModal: vi.fn(),
  openEpicModal: vi.fn(),
  openSettingsModal: vi.fn(),
  openFeedbackModal: vi.fn(),
  closeModal: vi.fn(),
};

function ContextHarness({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState(initialFilters);
  const filtersValue: AppFiltersState = useMemo(
    () => ({
      filters,
      setProjectId: (projectId) => setFilters((current) => ({ ...current, projectId })),
      setEpicId: (epicId, projectId) =>
        setFilters((current) => ({
          ...current,
          epicId,
          projectId: projectId ?? current.projectId,
        })),
      toggleTag: (tag) =>
        setFilters((current) => ({
          ...current,
          tags: current.tags.includes(tag)
            ? current.tags.filter((currentTag) => currentTag !== tag)
            : [...current.tags, tag],
        })),
      clearTagFilters: () => setFilters((current) => ({ ...current, tags: [] })),
      clearAllFilters: () => setFilters(initialFilters),
    }),
    [filters]
  );

  return (
    <AppFiltersContext.Provider value={filtersValue}>
      <AppModalActionsContext.Provider value={modalActions}>
        {children}
      </AppModalActionsContext.Provider>
    </AppFiltersContext.Provider>
  );
}

describe("AppLayoutContext", () => {
  it("keeps modal action consumers isolated from filter updates", () => {
    const onFilterRender = vi.fn();
    const onModalActionRender = vi.fn();

    function FilterConsumer() {
      onFilterRender();
      const { filters, setProjectId } = useAppFilters();

      return (
        <button type="button" onClick={() => setProjectId("project-1")}>
          Project: {filters.projectId ?? "none"}
        </button>
      );
    }

    const ModalActionConsumer = memo(function ModalActionConsumer() {
      onModalActionRender();
      const { openProjectModal } = useAppModalActions();

      return (
        <button type="button" onClick={() => openProjectModal()}>
          New project
        </button>
      );
    });

    render(
      <ContextHarness>
        <FilterConsumer />
        <ModalActionConsumer />
      </ContextHarness>
    );

    expect(onFilterRender).toHaveBeenCalledTimes(1);
    expect(onModalActionRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Project: none" }));

    expect(screen.getByRole("button", { name: "Project: project-1" })).toBeInTheDocument();
    expect(onFilterRender).toHaveBeenCalledTimes(2);
    expect(onModalActionRender).toHaveBeenCalledTimes(1);
  });
});
