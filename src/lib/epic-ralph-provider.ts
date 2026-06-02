import { getDefaultRalphAutonomousProviderForWorkingMethod } from "./ui-launch-dispatcher";
import type { RalphAutonomousUiLaunchProvider } from "./launch-provider-contract";
import type { Epic, ProjectBase } from "./hooks";

/**
 * Resolve the default Ralph autonomous launch provider for the project that owns
 * the given epic. Shared by AppLayout (ProjectsPanel) and the lazy MobileSidebar
 * so the lookup lives in one place instead of being duplicated across both.
 */
export function getEpicRalphProvider(
  projects: Array<ProjectBase & { epics?: Epic[] }>,
  epicId: string
): RalphAutonomousUiLaunchProvider {
  const project = projects.find((candidate) => candidate.epics?.some((epic) => epic.id === epicId));
  return getDefaultRalphAutonomousProviderForWorkingMethod(project?.workingMethod);
}
