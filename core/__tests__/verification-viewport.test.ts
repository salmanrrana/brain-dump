import { expect, it } from "vitest";
import { createTestDatabase } from "../db.ts";
import { validateGenerateDemo } from "../review.ts";

it.each([0, -1, 1.5, 4097, Number.NaN])(
  "rejects an invalid viewport through the core demo boundary: %s",
  (width) => {
    const { db } = createTestDatabase();
    try {
      db.prepare("INSERT INTO projects (id, name, path) VALUES ('p', 'Fixture', '/tmp')").run();
      db.prepare(
        "INSERT INTO tickets (id, title, project_id, status) VALUES ('t', 'Fixture', 'p', 'ai_review')"
      ).run();
      expect(() =>
        validateGenerateDemo(db, {
          ticketId: "t",
          steps: [
            {
              order: 1,
              type: "visual",
              description: "Check responsive page",
              expectedOutcome: "Heading is visible",
              automation: {
                kind: "ui",
                route: "/",
                viewport: { width, height: 844 },
                assert: [{ type: "visible", selector: "h1" }],
                screenshot: true,
              },
            },
          ],
        })
      ).toThrow("viewport requires integer width and height");
    } finally {
      db.close();
    }
  }
);
