import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagListView from "./TagListView";
import type { TagMetadata } from "../lib/hooks";

/**
 * TagListView Component Tests
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Focus on what users see, click, and experience
 * - Each test answers: "What real user behavior does this verify?"
 *
 * User workflows tested:
 * 1. User navigates to Tags tab and sees all their tags with counts
 * 2. User searches/filters tags to find a specific one
 * 3. User sorts tags by name, count, or date
 * 4. User clicks a tag to drill down into its tickets
 * 5. User sees empty state when no tags exist
 */

// Helper to create tag metadata for tests
function createTagMetadata(overrides: Partial<TagMetadata> & { tag: string }): TagMetadata {
  return {
    ticketCount: 3,
    statusBreakdown: {
      backlog: 1,
      ready: 1,
      in_progress: 1,
      ai_review: 0,
      human_review: 0,
      done: 0,
    },
    lastUsedAt: "2026-03-01T12:00:00Z",
    ...overrides,
  };
}

const sampleTags: TagMetadata[] = [
  createTagMetadata({
    tag: "frontend",
    ticketCount: 5,
    statusBreakdown: {
      backlog: 1,
      ready: 1,
      in_progress: 1,
      ai_review: 0,
      human_review: 0,
      done: 2,
    },
    lastUsedAt: "2026-03-01T10:00:00Z",
  }),
  createTagMetadata({
    tag: "backend",
    ticketCount: 8,
    statusBreakdown: {
      backlog: 2,
      ready: 1,
      in_progress: 2,
      ai_review: 1,
      human_review: 0,
      done: 2,
    },
    lastUsedAt: "2026-03-02T10:00:00Z",
  }),
  createTagMetadata({
    tag: "api",
    ticketCount: 3,
    statusBreakdown: {
      backlog: 0,
      ready: 0,
      in_progress: 1,
      ai_review: 0,
      human_review: 0,
      done: 2,
    },
    lastUsedAt: "2026-02-28T10:00:00Z",
  }),
];

describe("TagListView", () => {
  // =========================================================================
  // VIEWING ALL TAGS
  // User behavior: Opens Tags tab and sees all tags with their ticket counts
  // =========================================================================

  describe("viewing tags", () => {
    it("shows all tags with their ticket counts when tags exist", () => {
      render(<TagListView tagsWithMetadata={sampleTags} />);

      // User sees each tag name
      expect(screen.getByText("frontend")).toBeInTheDocument();
      expect(screen.getByText("backend")).toBeInTheDocument();
      expect(screen.getByText("api")).toBeInTheDocument();

      // User sees ticket counts
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("shows done/total progress for each tag", () => {
      render(<TagListView tagsWithMetadata={sampleTags} />);

      // User sees progress breakdown (e.g., "2/5 done")
      expect(screen.getByText("2/5 done")).toBeInTheDocument();
      expect(screen.getByText("2/8 done")).toBeInTheDocument();
      expect(screen.getByText("2/3 done")).toBeInTheDocument();
    });

    it("shows empty state message when no tags exist", () => {
      render(<TagListView tagsWithMetadata={[]} />);

      expect(screen.getByText("No tags found")).toBeInTheDocument();
      expect(screen.getByText(/add tags to tickets to see them here/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // FILTERING TAGS
  // User behavior: Types in search box to find a specific tag
  // =========================================================================

  describe("filtering tags", () => {
    it("filters tags as user types in search box", async () => {
      const user = userEvent.setup();
      render(<TagListView tagsWithMetadata={sampleTags} />);

      const searchInput = screen.getByPlaceholderText("Filter tags...");
      await user.type(searchInput, "front");

      // Only "frontend" should be visible
      expect(screen.getByText("frontend")).toBeInTheDocument();
      expect(screen.queryByText("backend")).not.toBeInTheDocument();
      expect(screen.queryByText("api")).not.toBeInTheDocument();
    });

    it("shows no matching tags message when filter has no results", async () => {
      const user = userEvent.setup();
      render(<TagListView tagsWithMetadata={sampleTags} />);

      const searchInput = screen.getByPlaceholderText("Filter tags...");
      await user.type(searchInput, "nonexistent");

      expect(screen.getByText("No matching tags")).toBeInTheDocument();
    });

    it("filter is case-insensitive", async () => {
      const user = userEvent.setup();
      render(<TagListView tagsWithMetadata={sampleTags} />);

      const searchInput = screen.getByPlaceholderText("Filter tags...");
      await user.type(searchInput, "BACKEND");

      expect(screen.getByText("backend")).toBeInTheDocument();
      expect(screen.queryByText("frontend")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // SORTING TAGS
  // User behavior: Clicks column headers to sort the tag list
  // =========================================================================

  describe("sorting tags", () => {
    it("sorts by ticket count descending by default (most used first)", () => {
      render(<TagListView tagsWithMetadata={sampleTags} />);

      // Get all tag names in order from table rows
      const rows = screen.getAllByRole("row").slice(1); // skip header row
      const tagNames = rows.map((row) => within(row).getAllByRole("cell")[0]!.textContent);

      // Default sort: ticket count descending → backend(8), frontend(5), api(3)
      expect(tagNames).toEqual(["backend", "frontend", "api"]);
    });

    it("sorts by tag name when user clicks Tag header", async () => {
      const user = userEvent.setup();
      render(<TagListView tagsWithMetadata={sampleTags} />);

      // Click "Tag" column header
      await user.click(screen.getByText("Tag"));

      const rows = screen.getAllByRole("row").slice(1);
      const tagNames = rows.map((row) => within(row).getAllByRole("cell")[0]!.textContent);

      // Alphabetical ascending: api, backend, frontend
      expect(tagNames).toEqual(["api", "backend", "frontend"]);
    });

    it("toggles sort direction when clicking same header twice", async () => {
      const user = userEvent.setup();
      render(<TagListView tagsWithMetadata={sampleTags} />);

      // Click "Tickets" header (already sorted by ticketCount desc)
      // Clicking again should toggle to ascending
      await user.click(screen.getByText("Tickets"));

      const rows = screen.getAllByRole("row").slice(1);
      const tagNames = rows.map((row) => within(row).getAllByRole("cell")[0]!.textContent);

      // Ascending ticket count: api(3), frontend(5), backend(8)
      expect(tagNames).toEqual(["api", "frontend", "backend"]);
    });
  });

  // =========================================================================
  // TAG DRILL-DOWN
  // User behavior: Clicks a tag row to filter the board by that tag
  // =========================================================================

  describe("tag drill-down", () => {
    it("calls onTagClick when user clicks a tag row", async () => {
      const user = userEvent.setup();
      const onTagClick = vi.fn();
      render(<TagListView tagsWithMetadata={sampleTags} onTagClick={onTagClick} />);

      // Click the "frontend" tag row
      await user.click(screen.getByText("frontend"));

      expect(onTagClick).toHaveBeenCalledWith("frontend");
    });

    it("calls onTagClick with correct tag when user clicks any row", async () => {
      const user = userEvent.setup();
      const onTagClick = vi.fn();
      render(<TagListView tagsWithMetadata={sampleTags} onTagClick={onTagClick} />);

      // Click the "api" tag row
      await user.click(screen.getByText("api"));

      expect(onTagClick).toHaveBeenCalledWith("api");
    });
  });

  // =========================================================================
  // SINGLE TAG RENDERING
  // User behavior: Tags tab still works with just one tag in the system
  // =========================================================================

  describe("single tag", () => {
    it("displays correctly with a single tag", () => {
      const singleTag = [
        createTagMetadata({
          tag: "solo-tag",
          ticketCount: 1,
          statusBreakdown: {
            backlog: 0,
            ready: 0,
            in_progress: 0,
            ai_review: 0,
            human_review: 0,
            done: 1,
          },
        }),
      ];

      render(<TagListView tagsWithMetadata={singleTag} />);

      expect(screen.getByText("solo-tag")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("1/1 done")).toBeInTheDocument();
    });
  });
});
