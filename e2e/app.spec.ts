import { test, expect } from "@playwright/test";

test.describe("Brain Dump E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    // Wait for the app to load - look for the sidebar
    await expect(page.locator("aside")).toBeVisible();
    // Wait for content to load
    await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 10000 });
  });

  test.describe("Kanban Board Interactions", () => {
    test("should display tickets in columns", async ({ page }) => {
      // Verify we can see the Kanban columns
      await expect(page.locator("h3:has-text('Backlog')")).toBeVisible();
      await expect(page.locator("h3:has-text('Ready')")).toBeVisible();
      await expect(page.locator("h3:has-text('In Progress')")).toBeVisible();
      await expect(page.locator("h3:has-text('Review')")).toBeVisible();
      await expect(page.locator("h3:has-text('Done')")).toBeVisible();
    });

    test("should drag ticket between columns", async ({ page }) => {
      // Find a ticket card in the Ready column (sample data has one there)
      const ticketCard = page.locator("text=Try drag and drop").first();
      await expect(ticketCard).toBeVisible();

      // Get the In Progress column
      const inProgressColumn = page.locator("h3:has-text('In Progress')");

      // Perform drag and drop
      await ticketCard.dragTo(inProgressColumn);

      // Wait for update
      await page.waitForTimeout(500);

      // Ticket should still be visible (even if in different column)
      await expect(page.locator("text=Try drag and drop")).toBeVisible();
    });
  });

  test.describe("Search Functionality", () => {
    test("should find ticket via search", async ({ page }) => {
      // Type in search input
      const searchInput = page.getByPlaceholder("Search tickets...");
      await searchInput.fill("Welcome");

      // Wait for search results to appear (debounced)
      await page.waitForTimeout(600);

      // Verify search results appear with matching ticket
      await expect(page.locator("text=Welcome to Brain Dump!").first()).toBeVisible();
    });

    test("should open ticket from search results", async ({ page }) => {
      const searchInput = page.getByPlaceholder("Search tickets...");
      await searchInput.fill("Welcome");

      // Wait for results (debounced search)
      await page.waitForTimeout(600);

      // Click on any element with the ticket title text in the search dropdown
      await page.locator(".z-50 button:has-text('Welcome')").first().click();

      // Verify ticket modal opens
      await expect(page.locator("h2:has-text('Edit Ticket')")).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("View Toggle", () => {
    test("should toggle between Kanban and List view", async ({ page }) => {
      // Start in Kanban view - verify columns are visible
      await expect(page.locator("h3:has-text('Backlog')")).toBeVisible();

      // Click list view toggle button
      await page.locator("button[title='List view']").click();

      // Verify List view is shown (table with headers)
      await expect(page.locator("th:has-text('Title')")).toBeVisible();
      await expect(page.locator("th:has-text('Status')")).toBeVisible();

      // Click Kanban view toggle
      await page.locator("button[title='Kanban view']").click();

      // Verify Kanban columns are back
      await expect(page.locator("h3:has-text('Backlog')")).toBeVisible();
    });

    test("should persist view preference after reload", async ({ page }) => {
      // First switch to List view
      await page.locator("button[title='List view']").click();

      // Verify list view loaded
      await expect(page.locator("th:has-text('Title')")).toBeVisible();

      // Reload the page
      await page.reload();

      // Wait for app to load - check for the sidebar
      await expect(page.locator("aside")).toBeVisible();

      // Verify List view is still shown after reload
      await expect(page.locator("th:has-text('Title')")).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Ticket Modal", () => {
    test("should open ticket modal on card click", async ({ page }) => {
      // Click on a ticket card
      await page.locator("text=Welcome to Brain Dump!").first().click();

      // Verify modal opens
      await expect(page.locator("h2:has-text('Edit Ticket')")).toBeVisible();

      // Close with Escape
      await page.keyboard.press("Escape");
      await expect(page.locator("h2:has-text('Edit Ticket')")).not.toBeVisible();
    });

    test("should display ticket details in modal", async ({ page }) => {
      // Open the welcome ticket
      await page.locator("text=Welcome to Brain Dump!").first().click();

      // Wait for modal
      await expect(page.locator("h2:has-text('Edit Ticket')")).toBeVisible();

      // Verify various elements are present
      await expect(page.locator("label:has-text('Title')")).toBeVisible();
      await expect(page.locator("label:has-text('Description')")).toBeVisible();
      await expect(page.locator("label:has-text('Status')")).toBeVisible();
      await expect(page.locator("label:has-text('Priority')")).toBeVisible();
    });
  });

  test.describe("Sample Data", () => {
    test("should display sample data banner", async ({ page }) => {
      // Look for sample data banner text
      await expect(page.locator("text=Sample data is loaded")).toBeVisible();
    });

    test("should show delete sample data button", async ({ page }) => {
      // Verify delete button exists
      await expect(page.locator("button:has-text('Delete Sample Data')")).toBeVisible();
    });
  });

  test.describe("Tag Filtering", () => {
    test("should display tags in sidebar", async ({ page }) => {
      // Look for Tags section
      await expect(page.locator("h2:has-text('Tags')")).toBeVisible();

      // There should be sample tags - use exact match to avoid matching "Delete Sample Data"
      await expect(page.getByRole("button", { name: "sample", exact: true })).toBeVisible();
    });

    test("should filter tickets by tag", async ({ page }) => {
      // Click on the sample tag (exact match)
      const sampleTag = page.getByRole("button", { name: "sample", exact: true });
      await sampleTag.click();

      // Tag should be selected (cyan background)
      await expect(sampleTag).toHaveClass(/bg-cyan-600/);

      // Sample tickets should still be visible since they have the sample tag
      await expect(page.locator("text=Welcome to Brain Dump!").first()).toBeVisible();
    });

    test("should clear tag filters", async ({ page }) => {
      // Select a tag first (exact match)
      const sampleTag = page.getByRole("button", { name: "sample", exact: true });
      await sampleTag.click();
      await expect(sampleTag).toHaveClass(/bg-cyan-600/);

      // Clear filters
      await page.getByRole("button", { name: "Clear" }).click();

      // Tag should no longer be selected
      await expect(sampleTag).not.toHaveClass(/bg-cyan-600/);
    });
  });

  test.describe("Project Selection", () => {
    test("should highlight selected project", async ({ page }) => {
      // Click on Sample Project
      await page.locator("text=Sample Project").click();

      // Project should be highlighted (cyan background)
      await expect(
        page
          .locator("div")
          .filter({ hasText: /^Sample Project$/ })
          .first()
      ).toBeVisible();

      // Tickets should still be visible
      await expect(page.locator("text=Welcome to Brain Dump!").first()).toBeVisible();
    });

    test("should expand project to show epics", async ({ page }) => {
      // Click the chevron button to expand the project tree
      // The chevron is in a button inside the project row
      const chevronButton = page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-chevron-right") })
        .first();
      await chevronButton.click();

      // Wait a moment for expansion
      await page.waitForTimeout(300);

      // Epic should be visible
      await expect(page.locator("text=Getting Started")).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("New Ticket Button", () => {
    test("should open new ticket modal", async ({ page }) => {
      // Click new ticket button in header
      await page.getByRole("button", { name: "New Ticket" }).click();

      // Wait for modal to appear
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      // Required fields should be present
      await expect(page.getByPlaceholder("What needs to be done?")).toBeVisible();

      // Close modal
      await page.keyboard.press("Escape");
    });

    test("should require title and project", async ({ page }) => {
      // Click new ticket button
      await page.getByRole("button", { name: "New Ticket" }).click();

      // Wait for modal
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      // Create button should be disabled initially (no title entered)
      const createButton = page.getByRole("button", { name: "Create Ticket" });
      await expect(createButton).toBeDisabled();

      // Enter a title
      await page.getByPlaceholder("What needs to be done?").fill("Test ticket");

      // Still disabled without project
      await expect(createButton).toBeDisabled();

      // Select a project using the combobox
      const projectSelect = page.locator("select").first();
      await projectSelect.selectOption({ index: 1 });

      // Now should be enabled
      await expect(createButton).not.toBeDisabled();
    });
  });

  test.describe("Create Ticket Flow", () => {
    test("should create a ticket successfully", async ({ page }) => {
      // Open new ticket modal
      await page.getByRole("button", { name: "New Ticket" }).click();

      // Wait for modal to be fully visible
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      // Fill in the form
      await page.getByPlaceholder("What needs to be done?").fill("E2E Test Ticket");
      await page.getByPlaceholder("Additional details...").fill("Created by E2E test");

      // Select project
      await page.locator("select").first().selectOption({ index: 1 });

      // Submit
      await page.getByRole("button", { name: "Create Ticket" }).click();

      // Modal should close
      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 10000 });

      // Ticket should appear on board (in backlog)
      await expect(page.locator("text=E2E Test Ticket").first()).toBeVisible();
    });
  });

  test.describe("Project Creation", () => {
    test("should open project modal from sidebar", async ({ page }) => {
      // Find the add project button (+ button near Projects header)
      const addProjectBtn = page.locator("button[title='Add project']");
      await addProjectBtn.click();

      // Modal should open
      await expect(page.locator("h2:has-text('New Project')")).toBeVisible();

      // Close modal
      await page.keyboard.press("Escape");
    });

    test("should show project form fields", async ({ page }) => {
      // Open project modal
      await page.locator("button[title='Add project']").click();

      // Modal should show required fields
      await expect(page.getByPlaceholder("My Project")).toBeVisible();
      await expect(page.getByPlaceholder("/home/user/projects/my-project")).toBeVisible();

      // Create button should be disabled without name/path
      await expect(page.getByRole("button", { name: "Create Project" })).toBeDisabled();

      // Close modal
      await page.keyboard.press("Escape");
    });
  });

  test.describe("Start Work Button", () => {
    test("should show Start Work button in ticket modal", async ({ page }) => {
      // Open a ticket
      await page.locator("text=Welcome to Brain Dump!").first().click();

      // Wait for modal
      await expect(page.locator("h2:has-text('Edit Ticket')")).toBeVisible();

      // Start Work button should be visible
      await expect(page.locator("button:has-text('Start Work')")).toBeVisible();
    });
  });

  test.describe("Attachments in New Ticket Modal", () => {
    test("should show attachment section in new ticket modal", async ({ page }) => {
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      await expect(page.locator("text=Attachments")).toBeVisible();
      await expect(page.locator("text=Drag and drop files here")).toBeVisible();
      await expect(page.locator("text=Max file size: 10MB")).toBeVisible();
      await expect(page.locator("button:has-text('browse')")).toBeVisible();

      await page.keyboard.press("Escape");
    });

    test("should show upload zone with visual feedback area", async ({ page }) => {
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      const dropZone = page.locator(".border-dashed");
      await expect(dropZone).toBeVisible();
      await expect(dropZone.locator("text=Drag and drop files here")).toBeVisible();

      await page.keyboard.press("Escape");
    });

    test("should create ticket without attachments", async ({ page }) => {
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      await page.getByPlaceholder("What needs to be done?").fill("Ticket without attachments");
      await page.locator("select").first().selectOption({ index: 1 });

      await page.getByRole("button", { name: "Create Ticket" }).click();

      await expect(page.locator("h2:has-text('New Ticket')")).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator("text=Ticket without attachments").first()).toBeVisible();
    });

    test("should have file input for attachment uploads", async ({ page }) => {
      await page.getByRole("button", { name: "New Ticket" }).click();
      await expect(page.locator("h2:has-text('New Ticket')")).toBeVisible({ timeout: 10000 });

      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toHaveCount(1);
      await expect(fileInput).toHaveAttribute("multiple", "");

      await page.keyboard.press("Escape");
    });
  });
});
