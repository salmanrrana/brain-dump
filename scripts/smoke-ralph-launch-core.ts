import { db, sqlite } from "../src/lib/db";
import { launchRalphForEpicCore } from "../src/lib/ralph-launch/launch-epic";
import { launchRalphForTicketCore } from "../src/lib/ralph-launch/launch-ticket";

const ticketResult = await launchRalphForTicketCore(
  db,
  {
    ticketId: "__missing_ticket__",
  },
  { sqlite }
);

if (ticketResult.success || ticketResult.message !== "Ticket not found") {
  throw new Error(`Unexpected ticket smoke result: ${JSON.stringify(ticketResult)}`);
}

const epicResult = await launchRalphForEpicCore(
  db,
  {
    epicId: "__missing_epic__",
  },
  { sqlite }
);

if (epicResult.success || epicResult.message !== "Epic not found") {
  throw new Error(`Unexpected epic smoke result: ${JSON.stringify(epicResult)}`);
}

console.log("Ralph launch core smoke checks passed");
