import { createContext, useContext } from "react";
import type { Epic, Filters, ProjectBase } from "../lib/hooks";

export interface AppFiltersState {
  filters: Filters;
  setProjectId: (id: string | null) => void;
  setEpicId: (id: string | null, projectId?: string) => void;
  toggleTag: (tag: string) => void;
  clearTagFilters: () => void;
  clearAllFilters: () => void;
}

export interface AppModalActionsState {
  openNewTicketModal: () => void;
  openProjectModal: (project?: ProjectBase) => void;
  openEpicModal: (projectId: string, epic?: Epic) => void;
  openSettingsModal: () => void;
  openFeedbackModal: () => void;
  closeModal: () => void;
}

/**
 * `ticketRefreshKey` is split into its own context so that board/list — which
 * only need the key to trigger a refetch — do NOT re-render when the header
 * refresh spinner toggles `isRefreshing`. See AppRefreshState below.
 */
export interface AppTicketRefreshState {
  ticketRefreshKey: number;
}

/**
 * Refresh action + spinner state, consumed only by the header. `isRefreshing`
 * toggling here re-renders the header spinner (intended) but not board/list,
 * which subscribe to AppTicketRefreshContext instead.
 */
export interface AppRefreshState {
  refreshAllData: () => void;
  isRefreshing: boolean;
}

export interface AppSearchNavigationState {
  selectedTicketIdFromSearch: string | null;
  onSelectTicketFromSearch: (ticketId: string) => void;
  clearSelectedTicketFromSearch: () => void;
}

export interface AppSampleDataState {
  hasSampleData: boolean;
  isDeletingSampleData: boolean;
  deleteSampleData: () => void;
}

export interface AppEpicDeletionState {
  onDeleteEpic: (epic: Epic) => void;
}

export interface AppMobileMenuState {
  isMobileMenuOpen: boolean;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export interface AppProjectsPanelState {
  isProjectsPanelOpen: boolean;
  openProjectsPanel: () => void;
  closeProjectsPanel: () => void;
}

type AppState = AppFiltersState &
  AppModalActionsState &
  AppTicketRefreshState &
  AppRefreshState &
  AppSearchNavigationState &
  AppSampleDataState &
  AppEpicDeletionState &
  AppMobileMenuState &
  AppProjectsPanelState;

export const AppFiltersContext = createContext<AppFiltersState | null>(null);
export const AppModalActionsContext = createContext<AppModalActionsState | null>(null);
export const AppTicketRefreshContext = createContext<AppTicketRefreshState | null>(null);
export const AppRefreshContext = createContext<AppRefreshState | null>(null);
export const AppSearchNavigationContext = createContext<AppSearchNavigationState | null>(null);
export const AppSampleDataContext = createContext<AppSampleDataState | null>(null);
export const AppEpicDeletionContext = createContext<AppEpicDeletionState | null>(null);
export const AppMobileMenuContext = createContext<AppMobileMenuState | null>(null);
export const AppProjectsPanelContext = createContext<AppProjectsPanelState | null>(null);

function useRequiredContext<T>(context: T | null, hookName: string) {
  if (!context) {
    throw new Error(`${hookName} must be used within AppLayout`);
  }
  return context;
}

export function useAppFilters() {
  return useRequiredContext(useContext(AppFiltersContext), "useAppFilters");
}

export function useAppModalActions() {
  return useRequiredContext(useContext(AppModalActionsContext), "useAppModalActions");
}

/**
 * Subscribe to the ticket refresh key only. Use this in board/list so they
 * refetch on key bumps without re-rendering when the header spinner toggles.
 */
export function useAppTicketRefresh() {
  return useRequiredContext(useContext(AppTicketRefreshContext), "useAppTicketRefresh");
}

export function useAppRefresh() {
  return useRequiredContext(useContext(AppRefreshContext), "useAppRefresh");
}

export function useAppSearchNavigation() {
  return useRequiredContext(useContext(AppSearchNavigationContext), "useAppSearchNavigation");
}

export function useAppSampleData() {
  return useRequiredContext(useContext(AppSampleDataContext), "useAppSampleData");
}

export function useAppEpicDeletion() {
  return useRequiredContext(useContext(AppEpicDeletionContext), "useAppEpicDeletion");
}

export function useAppMobileMenu() {
  return useRequiredContext(useContext(AppMobileMenuContext), "useAppMobileMenu");
}

export function useAppProjectsPanel() {
  return useRequiredContext(useContext(AppProjectsPanelContext), "useAppProjectsPanel");
}

/**
 * Aggregate hook returning the full app state surface.
 *
 * ⚠️ Subscribes to EVERY context — including AppRefreshContext, so a caller
 * re-renders whenever `isRefreshing` toggles. This defeats the render isolation
 * that AppTicketRefreshContext provides. Prefer the granular hooks
 * (`useAppFilters`, `useAppTicketRefresh`, `useAppRefresh`, …); in particular
 * board/list should call `useAppTicketRefresh()` directly so the refresh
 * spinner does not re-render them. Use this only where the full merged state is
 * genuinely needed.
 */
export function useAppState() {
  return {
    ...useAppFilters(),
    ...useAppModalActions(),
    ...useAppTicketRefresh(),
    ...useAppRefresh(),
    ...useAppSearchNavigation(),
    ...useAppSampleData(),
    ...useAppEpicDeletion(),
    ...useAppMobileMenu(),
    ...useAppProjectsPanel(),
  } satisfies AppState;
}
