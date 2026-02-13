import { test, expect, type Page } from "@playwright/test";

/**
 * Drag and Drop E2E Tests - Kent C. Dodds Style
 *
 * These tests verify user-visible behavior:
 * 1. User drags a ticket to a new position in the same column
 * 2. User sees the ticket in its new position (not snapping back)
 * 3. User drags a ticket to a different column
 * 4. User sees the ticket in the new column
 */

test.describe("Kanban Board Drag and Drop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    // Wait for the app to fully load
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 10000 });
  });

  /**
   * Helper to get tickets in a column by their visual order
   */
  async function getTicketsInColumn(page: Page, columnName: string): Promise<string[]> {
    // Find the column by its header
    const columnHeader = page.locator(`h3:has-text('${columnName}')`);
    await expect(columnHeader).toBeVisible();

    // Get the parent column container and find all ticket cards within it
    const column = columnHeader.locator("xpath=ancestor::div[@role='region']");
    const ticketCards = column.locator("[data-testid^='ticket-card-']");

    // Get all ticket titles in order
    const count = await ticketCards.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const title = await ticketCards.nth(i).locator("h4").textContent();
      if (title) titles.push(title.trim());
    }
    return titles;
  }

  /**
   * Helper to perform drag and drop between two elements
   */
  async function dragTicket(page: Page, sourceText: string, targetText: string) {
    const sourceCard = page
      .locator(`[data-testid^='ticket-card-']:has-text('${sourceText}')`)
      .first();
    const targetCard = page
      .locator(`[data-testid^='ticket-card-']:has-text('${targetText}')`)
      .first();

    await expect(sourceCard).toBeVisible();
    await expect(targetCard).toBeVisible();

    await sourceCard.dragTo(targetCard);
  }

  /**
   * Helper to drag a ticket to a column (for moving between columns)
   */
  async function dragTicketToColumn(page: Page, ticketText: string, columnName: string) {
    const ticketCard = page
      .locator(`[data-testid^='ticket-card-']:has-text('${ticketText}')`)
      .first();
    const columnHeader = page.locator(`h3:has-text('${columnName}')`);

    await expect(ticketCard).toBeVisible();
    await expect(columnHeader).toBeVisible();

    // Get the column content area (the droppable zone)
    const column = columnHeader.locator("xpath=ancestor::div[@role='region']");
    const dropZone = column.locator("[data-droppable]");

    await ticketCard.dragTo(dropZone);
  }

  test.describe("Same Column Reordering", () => {
    test("user drags ticket to new position and sees it stay there", async ({ page }) => {
      // First, let's create two test tickets in the same column for a clean test
      // Open new ticket modal
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      // Create first test ticket
      await page.getByPlaceholder("What needs to be done?").fill("DnD Test Ticket A");
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: "Create Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 5000 });

      // Create second test ticket
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder("What needs to be done?").fill("DnD Test Ticket B");
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: "Create Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 5000 });

      // Wait for tickets to appear
      await expect(page.locator("text=DnD Test Ticket A").first()).toBeVisible();
      await expect(page.locator("text=DnD Test Ticket B").first()).toBeVisible();

      // Get initial order in Backlog
      const initialOrder = await getTicketsInColumn(page, "Backlog");
      const indexA = initialOrder.indexOf("DnD Test Ticket A");
      const indexB = initialOrder.indexOf("DnD Test Ticket B");

      // Both tickets should be in Backlog
      expect(indexA).toBeGreaterThanOrEqual(0);
      expect(indexB).toBeGreaterThanOrEqual(0);

      // Drag ticket B onto ticket A (this should reorder them)
      await dragTicket(page, "DnD Test Ticket B", "DnD Test Ticket A");

      // Wait for the drag operation to complete and UI to update
      await page.waitForTimeout(500);

      // Get the new order
      const newOrder = await getTicketsInColumn(page, "Backlog");
      const newIndexA = newOrder.indexOf("DnD Test Ticket A");
      const newIndexB = newOrder.indexOf("DnD Test Ticket B");

      // The order should have changed (B should now be before or at A's position)
      // The key assertion: the positions should be DIFFERENT from before
      // This verifies the "snap-back" bug is fixed
      expect(newIndexA).not.toBe(indexA);
      expect(newIndexB).not.toBe(indexB);

      // Both should still be in the column (not lost)
      expect(newIndexA).toBeGreaterThanOrEqual(0);
      expect(newIndexB).toBeGreaterThanOrEqual(0);
    });

    test("user reorders tickets and order persists after page reload", async ({ page }) => {
      // Create test tickets
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder("What needs to be done?").fill("Persist Test X");
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: "Create Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 5000 });

      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder("What needs to be done?").fill("Persist Test Y");
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: "Create Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 5000 });

      // Wait for tickets
      await expect(page.locator("text=Persist Test X").first()).toBeVisible();
      await expect(page.locator("text=Persist Test Y").first()).toBeVisible();

      // Get initial order
      const initialOrder = await getTicketsInColumn(page, "Backlog");
      const initialIndexX = initialOrder.indexOf("Persist Test X");

      // Perform drag
      await dragTicket(page, "Persist Test Y", "Persist Test X");
      await page.waitForTimeout(500);

      // Get order after drag
      const orderAfterDrag = await getTicketsInColumn(page, "Backlog");
      const afterDragIndexX = orderAfterDrag.indexOf("Persist Test X");
      const afterDragIndexY = orderAfterDrag.indexOf("Persist Test Y");

      // Order should have changed
      expect(afterDragIndexX).not.toBe(initialIndexX);

      // Wait for server sync then reload
      await page.waitForTimeout(1000);
      await page.reload();
      await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 10000 });

      // Get order after reload
      const orderAfterReload = await getTicketsInColumn(page, "Backlog");
      const afterReloadIndexX = orderAfterReload.indexOf("Persist Test X");
      const afterReloadIndexY = orderAfterReload.indexOf("Persist Test Y");

      // Order should match what it was after drag (persisted to server)
      expect(afterReloadIndexX).toBe(afterDragIndexX);
      expect(afterReloadIndexY).toBe(afterDragIndexY);
    });
  });

  test.describe("Cross Column Movement", () => {
    test("user drags ticket to different column and sees it there", async ({ page }) => {
      // Create a test ticket
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder("What needs to be done?").fill("Cross Column Test");
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: "Create Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 5000 });

      // Wait for ticket to appear in Backlog
      await expect(page.locator("text=Cross Column Test").first()).toBeVisible();

      // Verify it's in Backlog
      const backlogTickets = await getTicketsInColumn(page, "Backlog");
      expect(backlogTickets).toContain("Cross Column Test");

      // Drag to In Progress column
      await dragTicketToColumn(page, "Cross Column Test", "In Progress");
      await page.waitForTimeout(500);

      // Verify it's now in In Progress and not in Backlog
      const backlogAfter = await getTicketsInColumn(page, "Backlog");
      const inProgressAfter = await getTicketsInColumn(page, "In Progress");

      expect(backlogAfter).not.toContain("Cross Column Test");
      expect(inProgressAfter).toContain("Cross Column Test");
    });

    test("user moves ticket between columns and change persists after reload", async ({ page }) => {
      // Create a test ticket
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder("What needs to be done?").fill("Persist Column Test");
      await page.locator("select").first().selectOption({ index: 1 });
      await page.getByRole("button", { name: "Create Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 5000 });

      await expect(page.locator("text=Persist Column Test").first()).toBeVisible();

      // Drag to Ready column
      await dragTicketToColumn(page, "Persist Column Test", "Ready");
      await page.waitForTimeout(500);

      // Verify it moved
      const readyAfterDrag = await getTicketsInColumn(page, "Ready");
      expect(readyAfterDrag).toContain("Persist Column Test");

      // Wait for server sync and reload
      await page.waitForTimeout(1000);
      await page.reload();
      await expect(page.locator("h3:has-text('Ready')")).toBeVisible({ timeout: 10000 });

      // Verify it's still in Ready after reload
      const readyAfterReload = await getTicketsInColumn(page, "Ready");
      expect(readyAfterReload).toContain("Persist Column Test");
    });
  });

  test.describe("Visual Feedback During Drag", () => {
    test("user sees ticket while dragging (no disappearance)", async ({ page }) => {
      // Find a ticket to drag
      const ticketCard = page.locator("[data-testid^='ticket-card-']").first();
      await expect(ticketCard).toBeVisible();

      const ticketTitle = await ticketCard.locator("h4").textContent();

      // Start dragging using mouse events for more control
      const box = await ticketCard.boundingBox();
      if (!box) throw new Error("Could not get ticket bounding box");

      // Mouse down to start drag
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();

      // Move a bit to trigger drag
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50, { steps: 5 });

      // During drag, we should see a drag overlay or the original ticket
      // The ticket content should still be visible somewhere on the page
      await expect(page.locator(`text=${ticketTitle}`).first()).toBeVisible();

      // Release
      await page.mouse.up();

      // Ticket should still be visible after drop
      await expect(page.locator(`text=${ticketTitle}`).first()).toBeVisible();
    });
  });
});
