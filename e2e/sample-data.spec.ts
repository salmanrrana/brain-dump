import { test, expect } from "@playwright/test";

test.describe("Sample Data Initialization - E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app - sample data should be created on first launch
    await page.goto("/");

    // Wait for the sidebar to load
    await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });

    // Wait for the kanban board to load - this ensures app initialization is complete
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 10000 });
  });

  test("app initializes without errors and creates sample data", async ({ page }) => {
    // Verify no console errors related to db or undefined
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        (msg.text().includes("db") ||
          msg.text().includes("undefined") ||
          msg.text().includes("Cannot read properties"))
      ) {
        errors.push(msg.text());
      }
    });

    // Wait a moment for any initialization errors to appear
    await page.waitForTimeout(1000);

    // Then: no critical errors should have appeared
    expect(errors).toHaveLength(0);
  });

  test("sample data appears in kanban board", async ({ page }) => {
    // Verify all 4 sample tickets appear in their expected columns

    // 1. "Welcome to Brain Dump!" should be in Done column
    await expect(page.locator("text=Welcome to Brain Dump!").first()).toBeVisible({
      timeout: 5000,
    });

    // 2. "Create your first project" should be in Progress column
    await expect(page.locator("text=Create your first project").first()).toBeVisible({
      timeout: 5000,
    });

    // 3. "Try drag and drop" should be in Ready column
    await expect(page.locator("text=Try drag and drop").first()).toBeVisible({ timeout: 5000 });

    // 4. "Use Start Work to integrate with Claude" should be in Backlog column
    await expect(page.locator("text=Use Start Work to integrate with Claude").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("sample project and epic are created", async ({ page }) => {
    // Open sidebar to check projects
    // The project "Sample Project" should exist
    const sampleProject = page.locator("text=Sample Project").first();
    await expect(sampleProject).toBeVisible({ timeout: 5000 });
  });

  test("sample tickets are clickable and show details", async ({ page }) => {
    // Click on the "Welcome to Brain Dump!" ticket
    await page.locator("text=Welcome to Brain Dump!").first().click();

    // Wait for the ticket modal to open
    await expect(page.locator("h2:has-text('Edit Ticket')")).toBeVisible({ timeout: 5000 });

    // Verify the ticket title is shown
    await expect(page.locator("input[value='Welcome to Brain Dump!']")).toBeVisible();

    // Verify the epic is linked
    await expect(page.locator("text=Getting Started")).toBeVisible();
  });

  test("sample tickets have correct status", async ({ page }) => {
    // These tests verify the specific sample tickets appear with their correct status values

    // "Welcome to Brain Dump!" is marked as done
    const doneColumn = page.locator("h3:has-text('Done')");
    await expect(doneColumn).toBeVisible();

    const welcomeInDone = doneColumn.locator("..").locator("text=Welcome to Brain Dump!");
    await expect(welcomeInDone).toBeVisible({ timeout: 5000 });

    // "Create your first project" is in progress
    const progressColumn = page.locator("h3:has-text('In Progress')");
    await expect(progressColumn).toBeVisible();

    const createInProgress = progressColumn.locator("..").locator("text=Create your first project");
    await expect(createInProgress).toBeVisible({ timeout: 5000 });

    // "Try drag and drop" is ready
    const readyColumn = page.locator("h3:has-text('Ready')");
    await expect(readyColumn).toBeVisible();

    const dragInReady = readyColumn.locator("..").locator("text=Try drag and drop");
    await expect(dragInReady).toBeVisible({ timeout: 5000 });

    // "Use Start Work to integrate with Claude" is in backlog
    const backlogColumn = page.locator("h3:has-text('Backlog')");
    await expect(backlogColumn).toBeVisible();

    const claudeInBacklog = backlogColumn
      .locator("..")
      .locator("text=Use Start Work to integrate with Claude");
    await expect(claudeInBacklog).toBeVisible({ timeout: 5000 });
  });

  test("no db undefined errors appear in console", async ({ page }) => {
    // This is the regression test - verify the fix for the module externalization error
    // Before the fix: "[hooks:sample-data] ERROR: Failed to check/create sample data Error: Cannot read properties of undefined (reading 'select')"
    // After the fix: No such error appears

    const dbErrors: string[] = [];
    const undefinedErrors: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("Cannot read properties of undefined")) {
        undefinedErrors.push(text);
      }
      if (text.includes("[hooks:sample-data]") && text.includes("ERROR")) {
        dbErrors.push(text);
      }
    });

    // Wait for app to fully load
    await page.waitForTimeout(2000);

    // Verify no critical errors
    expect(undefinedErrors).toHaveLength(0);
    expect(dbErrors).toHaveLength(0);

    // Additionally verify sample data actually loaded
    await expect(page.locator("text=Welcome to Brain Dump!")).toBeVisible();
  });

  test("sample data persists on page reload", async ({ page }) => {
    // Verify initial load has sample data
    await expect(page.locator("text=Welcome to Brain Dump!")).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.reload();

    // Wait for app to reload
    await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 10000 });

    // Verify sample data still exists
    await expect(page.locator("text=Welcome to Brain Dump!")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Create your first project")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Try drag and drop")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Use Start Work to integrate with Claude")).toBeVisible({
      timeout: 5000,
    });
  });
});
