import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { launchRalphForEpicCore } from "../lib/ralph-launch/launch-epic";
import { launchRalphForTicketCore } from "../lib/ralph-launch/launch-ticket";
import type { LaunchEpicInput, LaunchTicketInput } from "../lib/ralph-launch/types";

export type {
  RalphPromptProfile,
  RalphImplementationPromptProfile,
  RalphReviewPromptProfile,
  RalphReviewPromptTarget,
} from "./ralph-prompts";
export type { RalphAiBackend, DockerResourceLimits, ProjectOriginInfo } from "./ralph-script";
export type { ActiveRalphSession } from "./ralph-sessions";
export type {
  LaunchEpicInput,
  LaunchTicketInput,
  RalphEpicLaunchProfile,
  RalphImplementationLaunchProfile,
  RalphReviewLaunchProfile,
  RalphWorkingMethod,
} from "../lib/ralph-launch/types";

export {
  clearActiveSessionsForProject,
  getActiveRalphSession,
  getActiveRalphSessions,
} from "./ralph-sessions";
// NOTE: prepareEpicLaunch is intentionally NOT re-exported here.
// ralph.ts is imported by client hooks (src/lib/hooks/ralph.ts), and any
// top-level re-export from ../lib/ralph-launch/* drags core/db.ts and
// better-sqlite3 into the browser bundle (causes `promisify is not a function`).
// Import prepareEpicLaunch directly from "../lib/ralph-launch/launch-epic" on the server.

export const launchRalphForTicket = createServerFn({ method: "POST" })
  .inputValidator((data: LaunchTicketInput) => data)
  .handler(async ({ data }) => launchRalphForTicketCore(db, data, { sqlite }));

export const launchRalphForEpic = createServerFn({ method: "POST" })
  .inputValidator((data: LaunchEpicInput) => data)
  .handler(async ({ data }) => launchRalphForEpicCore(db, data, { sqlite }));
