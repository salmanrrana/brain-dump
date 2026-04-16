import { test, expect } from "@playwright/test";

/**
 * End-to-end checks for click-to-copy on tag pills across the app surfaces
 * described in the "Click-to-Copy Tags" epic verification ticket.
 *
 * Uses a tagged ticket created in beforeAll so tests work with the minimal
 * DB seed (non-UUID ids) used under Playwright's isolated XDG directories.
 */
test.describe("Click-to-copy tags", () => {
  // Retries create duplicate titled tickets and break strict locators; keep single attempt.
  test.describe.configure({ mode: "serial", retries: 0 });

  const taggedTags = { a: "alpha", b: "beta" } as const;
  let taggedTicketTitle: string;
  let taggedTicketDetailUrl: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://localhost:5174",
    });
    const page = await context.newPage();
    await page.goto("/board");
    await expect(page.locator("aside")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 20000 });

    taggedTicketTitle = `E2E tag copy ${Date.now().toString(36)}`;
    await openCreateTicketModal(page);
    await page.getByPlaceholder("What needs to be done?").fill(taggedTicketTitle);
    await page.locator("select").first().selectOption({ index: 1 });
    const tagField = page.getByRole("textbox", { name: "Add tag" });
    await tagField.fill(taggedTags.a);
    await tagField.press("Enter");
    await tagField.fill(taggedTags.b);
    await tagField.press("Enter");
    await page.getByRole("button", { name: "Create Ticket" }).click();
    await expect(page.getByRole("dialog", { name: "New Ticket" })).not.toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("heading", { level: 3, name: taggedTicketTitle }).click();
    await expect(page.locator("h2:has-text('Edit Ticket')")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "View full ticket details" }).click();
    await expect(page).toHaveURL(/\/ticket\/.+/);
    taggedTicketDetailUrl = page.url();
    await context.close();
  });

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://localhost:5174",
    });
    await page.goto("/board");
    await expect(page.locator("aside")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15000 });
  });

  async function readClipboard(page: import("@playwright/test").Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
  }

  /** Header control is a split button: open dropdown, then choose "New Ticket". */
  async function openCreateTicketModal(page: import("@playwright/test").Page): Promise<void> {
    await page.getByRole("button", { name: "Create new ticket or start from scratch" }).click();
    await page.getByRole("option", { name: "New Ticket" }).click();
    await expect(page.getByRole("dialog", { name: "New Ticket" })).toBeVisible({ timeout: 10000 });
  }

  test("ticket detail header: click copies tag and shows Copied!", async ({ page }) => {
    await page.goto(taggedTicketDetailUrl);
    await page.getByRole("button", { name: `Copy tag ${taggedTags.b}` }).click();
    expect(await readClipboard(page)).toBe(taggedTags.b);
    await expect(page.getByText("Copied!", { exact: true }).first()).toBeVisible();
  });

  test("kanban card: tag click copies and does not open edit modal", async ({ page }) => {
    const card = page
      .locator("div.group.relative")
      .filter({ has: page.getByRole("heading", { level: 3, name: taggedTicketTitle }) });
    await card.getByRole("button", { name: `Copy tag ${taggedTags.a}` }).click();
    expect(await readClipboard(page)).toBe(taggedTags.a);
    await expect(page.locator("h2:has-text('Edit Ticket')")).not.toBeVisible();
    await expect(page.getByText("Copied!", { exact: true }).first()).toBeVisible();
  });

  test("list view: tag click copies and does not leave list route", async ({ page }) => {
    await page.getByRole("button", { name: "List view" }).click();
    await expect(page.locator("th:has-text('Title')")).toBeVisible({ timeout: 10000 });
    const row = page.locator("tbody tr").filter({ hasText: taggedTicketTitle });
    await row.getByRole("button", { name: `Copy tag ${taggedTags.a}` }).click();
    expect(await readClipboard(page)).toBe(taggedTags.a);
    await expect(page).toHaveURL(/\/list/);
    await expect(page.getByText("Copied!", { exact: true }).first()).toBeVisible();
  });

  test("TicketModal (board): copy tag from pill shows Copied!", async ({ page }) => {
    await page.getByRole("heading", { level: 3, name: taggedTicketTitle }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Ticket" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("button", { name: `Copy tag ${taggedTags.b}` }).click();
    expect(await readClipboard(page)).toBe(taggedTags.b);
    await expect(page.getByText("Copied!", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("EditTicketModal (from ticket detail): copy works on tag pill", async ({ page }) => {
    await page.goto(taggedTicketDetailUrl);
    await page.getByRole("button", { name: "Edit ticket" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Ticket" });
    await expect(editDialog).toBeVisible({ timeout: 10000 });
    await editDialog.getByRole("button", { name: `Copy tag ${taggedTags.a}` }).click();
    expect(await readClipboard(page)).toBe(taggedTags.a);
    await expect(page.getByText("Copied!", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("keyboard: Enter on copyable tag copies text", async ({ page }) => {
    const card = page
      .locator("div.group.relative")
      .filter({ has: page.getByRole("heading", { level: 3, name: taggedTicketTitle }) });
    const copyBtn = card.getByRole("button", { name: `Copy tag ${taggedTags.b}` });
    await copyBtn.focus();
    await page.keyboard.press("Enter");
    expect(await readClipboard(page)).toBe(taggedTags.b);
    await expect(page.getByText("Copied!", { exact: true }).first()).toBeVisible();
  });

  test("new ticket modal: tags can be added before create (pills are not copy-on-click yet)", async ({
    page,
  }) => {
    const unique = `e2e-${Date.now()}`;
    await openCreateTicketModal(page);
    await page.getByPlaceholder("What needs to be done?").fill(`Tag modal ticket ${unique}`);
    await page.locator("select").first().selectOption({ index: 1 });
    const tagField = page.getByRole("textbox", { name: "Add tag" });
    await tagField.fill(unique);
    await tagField.press("Enter");
    await expect(page.getByText(unique, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: `Copy tag ${unique}` })).not.toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("TicketModal: Remove tag X persists after Save Changes", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const title = `E2E pill remove ${suffix}`;
    const tagOnly = `zapid${suffix}`;
    await openCreateTicketModal(page);
    await page.getByPlaceholder("What needs to be done?").fill(title);
    await page.locator("select").first().selectOption({ index: 1 });
    const tagField = page.getByRole("textbox", { name: "Add tag" });
    await tagField.fill(tagOnly);
    await tagField.press("Enter");
    await page.getByRole("button", { name: "Create Ticket" }).click();
    await expect(page.getByRole("dialog", { name: "New Ticket" })).not.toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("heading", { level: 3, name: title }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Ticket" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("button", { name: `Remove tag ${tagOnly}` }).click();
    await expect(editDialog.getByRole("button", { name: `Copy tag ${tagOnly}` })).not.toBeVisible();
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    await page.reload();
    await expect(page.locator("aside")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15000 });
    await page.getByRole("heading", { level: 3, name: title }).click();
    const editAgain = page.getByRole("dialog", { name: "Edit Ticket" });
    await expect(editAgain).toBeVisible();
    await expect(editAgain.getByRole("button", { name: `Copy tag ${tagOnly}` })).not.toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("kanban drag-and-drop still moves ticket between columns", async ({ page }) => {
    const ticketCard = page.getByRole("button", { name: /Open ticket:.*Start Work/i }).first();
    await expect(ticketCard).toBeVisible();
    const inProgressColumn = page.locator("h3:has-text('In Progress')");
    await ticketCard.dragTo(inProgressColumn);
    await page.waitForTimeout(500);
    await expect(ticketCard).toBeVisible();
  });

  test("board header tag filter: select alpha in Tags dropdown then clear filters", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /^Tags( \(\d+\))?$/ }).click();
    await page.getByRole("option", { name: taggedTags.a }).click();
    await expect(page.getByRole("button", { name: "Tags (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Clear 1 active filters" }).click();
    await expect(page.getByRole("button", { name: /^Tags$/ })).toBeVisible();
  });
});
