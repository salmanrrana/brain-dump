import { expect, test } from "@playwright/test";

for (const path of ["/board", "/list"]) {
  test(`${path} keeps server-loaded data through hydration`, async ({ page }) => {
    const errors: string[] = [];
    const calls: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => {
      const id = new URL(request.url()).pathname.split("/_serverFn/")[1];
      if (id) calls.push(Buffer.from(id, "base64url").toString("utf8"));
    });

    await page.goto(path);
    // Server HTML alone can satisfy visibility assertions before React starts.
    // This mark is emitted by the root effect in the E2E development server.
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByName("app:hydration:end").length))
      .toBeGreaterThan(0);

    if (path === "/board") {
      await expect(page.getByRole("heading", { name: "Backlog", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("columnheader", { name: "Title", exact: true })).toBeVisible();
    }

    expect(errors.filter((error) => /hydrat|server rendered/i.test(error))).toEqual([]);
    expect(
      calls.filter((call) => /getTicketSummaries|getProjectsWithEpics/.test(call)),
      "Loader data should not be fetched again during hydration"
    ).toEqual([]);
  });
}
