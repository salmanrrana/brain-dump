import { describe, expect, it } from "vitest";
import { db } from "../db";
import { launchRalphForEpicCore } from "./launch-epic";
import { launchRalphForTicketCore } from "./launch-ticket";

describe("ralph launch core", () => {
  it("can be called directly without createServerFn wrappers", async () => {
    await expect(
      launchRalphForTicketCore(db, {
        ticketId: "__missing_ticket__",
      })
    ).resolves.toEqual({
      success: false,
      message: "Ticket not found",
    });

    await expect(
      launchRalphForEpicCore(db, {
        epicId: "__missing_epic__",
      })
    ).resolves.toEqual({
      success: false,
      message: "Epic not found",
    });
  });
});
