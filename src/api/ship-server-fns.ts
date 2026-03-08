import { createServerFn } from "@tanstack/react-start";
import type {
  CommitAndShipInput,
  CommitAndShipResult,
  GeneratePrBodyInput,
  GeneratePrBodyResult,
  PushBranchInput,
  PushBranchResult,
  ShipPrepInput,
  ShipPrepResult,
  SyncPrVerificationChecklistInput,
  SyncPrVerificationChecklistResult,
} from "./ship-core";

export type { ShipMutationStep, ShipPrepData } from "./ship-core";

async function getShipCore() {
  return await import("./ship-core");
}

export const getShipPrep = createServerFn({ method: "POST" })
  .inputValidator((data: ShipPrepInput) => data)
  .handler(async ({ data }: { data: ShipPrepInput }): Promise<ShipPrepResult> => {
    const { getShipPrepData, defaultShipPrepDeps, getErrorMessage } = await getShipCore();

    try {
      const result = await getShipPrepData(data, defaultShipPrepDeps);
      return {
        success: true as const,
        ...result,
      };
    } catch (error) {
      return {
        success: false as const,
        error: getErrorMessage(error),
      };
    }
  });

export const generatePrBodyServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: GeneratePrBodyInput) => data)
  .handler(async ({ data }: { data: GeneratePrBodyInput }): Promise<GeneratePrBodyResult> => {
    const { generatePrBody, defaultShipPrepDeps } = await getShipCore();
    return generatePrBody(data, defaultShipPrepDeps.db);
  });

export const commitAndShipServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: CommitAndShipInput) => data)
  .handler(async ({ data }: { data: CommitAndShipInput }): Promise<CommitAndShipResult> => {
    const { commitAndShip, defaultCommitAndShipDeps } = await getShipCore();
    return commitAndShip(data, defaultCommitAndShipDeps);
  });

export const pushBranchServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: PushBranchInput) => data)
  .handler(async ({ data }: { data: PushBranchInput }): Promise<PushBranchResult> => {
    const { pushBranch, defaultPushBranchDeps } = await getShipCore();
    return pushBranch(data, defaultPushBranchDeps);
  });

export const syncPrVerificationChecklistServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: SyncPrVerificationChecklistInput) => data)
  .handler(
    async ({
      data,
    }: {
      data: SyncPrVerificationChecklistInput;
    }): Promise<SyncPrVerificationChecklistResult> => {
      const { defaultPushBranchDeps } = await getShipCore();
      const { syncPrVerificationChecklist } = await import("../../core/ship.ts");

      return await syncPrVerificationChecklist(data, {
        db: defaultPushBranchDeps.db,
        execFileNoThrow: defaultPushBranchDeps.execFileNoThrow,
      });
    }
  );
