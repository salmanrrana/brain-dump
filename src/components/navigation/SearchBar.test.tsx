import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "./SearchBar";
import * as hooks from "../../lib/hooks";

// Mock the useSearch hook since it makes API calls
vi.mock("../../lib/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("../../lib/hooks");
  return {
    ...actual,
    useSearch: vi.fn(),
  };
});

// Mock search results for testing
const mockResults: hooks.SearchResult[] = [
  {
    id: "ticket-1",
    title: "Fix authentication bug",
    description: "Users cannot log in",
    status: "in_progress",
    priority: "high",
    projectId: "proj-1",
    epicId: null,
    tags: null,
    snippet: "Fix authentication <mark>bug</mark> in login flow",
  },
  {
    id: "ticket-2",
    title: "Add dark mode toggle",
    description: "Implement dark mode",
    status: "backlog",
    priority: "medium",
    projectId: "proj-1",
    epicId: null,
    tags: null,
    snippet: "Add dark mode <mark>toggle</mark> to settings",
  },
  {
    id: "ticket-3",
    title: "API documentation",
    description: "Write API docs",
    status: "done",
    priority: "low",
    projectId: "proj-2",
    epicId: null,
    tags: null,
    snippet: "Write <mark>API</mark> documentation",
  },
];

describe("SearchBar", () => {
  let mockSearchFn: ReturnType<typeof vi.fn>;
  let mockClearSearch: ReturnType<typeof vi.fn>;
  let mockUseSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSearchFn = vi.fn();
    mockClearSearch = vi.fn();
    mockUseSearch = hooks.useSearch as ReturnType<typeof vi.fn>;

    // Default mock returns empty state
    mockUseSearch.mockReturnValue({
      query: "",
      results: [],
      loading: false,
      error: null,
      search: mockSearchFn,
      clearSearch: mockClearSearch,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders search input with placeholder", () => {
      render(<SearchBar />);

      expect(screen.getByRole("combobox", { name: "Search tickets" })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search tickets...")).toBeInTheDocument();
    });

    it("renders custom placeholder when provided", () => {
      render(<SearchBar placeholder="Find tasks..." />);

      expect(screen.getByPlaceholderText("Find tasks...")).toBeInTheDocument();
    });

    it("renders search icon", () => {
      render(<SearchBar />);

      // The Search icon is aria-hidden, so we check for the input wrapper
      const input = screen.getByRole("combobox");
      expect(input).toBeInTheDocument();
    });

    it("does not render dropdown when query is empty", () => {
      render(<SearchBar />);

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("respects disabled prop", () => {
      render(<SearchBar disabled />);

      expect(screen.getByRole("combobox")).toBeDisabled();
    });
  });

  describe("Search functionality", () => {
    it("calls search function when user types", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.type(input, "bug");

      // Search is called for each character typed
      // Since the hook is mocked and doesn't update query, each keystroke
      // sends the character that was typed (the input value change event)
      expect(mockSearchFn).toHaveBeenCalledTimes(3);
      expect(mockSearchFn).toHaveBeenNthCalledWith(1, "b");
      expect(mockSearchFn).toHaveBeenNthCalledWith(2, "u");
      expect(mockSearchFn).toHaveBeenNthCalledWith(3, "g");
    });

    it("shows dropdown when there is a query", () => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("shows loading state while searching", () => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: [],
        loading: true,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      expect(screen.getByText("Searching...")).toBeInTheDocument();
    });

    it("shows error message when search fails", () => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: [],
        loading: false,
        error: "Connection failed",
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      expect(screen.getByText("Search failed: Connection failed")).toBeInTheDocument();
    });

    it("shows empty state when no results found", () => {
      mockUseSearch.mockReturnValue({
        query: "xyz123nonexistent",
        results: [],
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  describe("Results display", () => {
    beforeEach(() => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });
    });

    it("displays search results with titles", () => {
      render(<SearchBar />);

      expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
      expect(screen.getByText("Add dark mode toggle")).toBeInTheDocument();
      expect(screen.getByText("API documentation")).toBeInTheDocument();
    });

    it("displays status badges for each result", () => {
      render(<SearchBar />);

      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("Backlog")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("calls onResultSelect when clicking a result", async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();

      render(<SearchBar onResultSelect={handleSelect} />);

      await user.click(screen.getByText("Fix authentication bug"));

      expect(handleSelect).toHaveBeenCalledWith(mockResults[0]);
      expect(mockClearSearch).toHaveBeenCalled();
    });
  });

  describe("Keyboard navigation", () => {
    beforeEach(() => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });
    });

    it("selects first result with ArrowDown", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");

      const firstResult = screen.getByRole("option", { name: /Fix authentication bug/i });
      expect(firstResult).toHaveAttribute("aria-selected", "true");
    });

    it("navigates through results with ArrowDown and ArrowUp", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      // Navigate down twice
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");

      const secondResult = screen.getByRole("option", { name: /Add dark mode toggle/i });
      expect(secondResult).toHaveAttribute("aria-selected", "true");

      // Navigate back up
      await user.keyboard("{ArrowUp}");

      const firstResult = screen.getByRole("option", { name: /Fix authentication bug/i });
      expect(firstResult).toHaveAttribute("aria-selected", "true");
    });

    it("wraps around when reaching the end of results", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      // Navigate to the last item, then one more
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");

      // Should wrap to first item
      const firstResult = screen.getByRole("option", { name: /Fix authentication bug/i });
      expect(firstResult).toHaveAttribute("aria-selected", "true");
    });

    it("selects result with Enter key", async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();

      render(<SearchBar onResultSelect={handleSelect} />);

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      expect(handleSelect).toHaveBeenCalledWith(mockResults[0]);
    });

    it("closes dropdown with Escape key", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("Clear functionality", () => {
    it("shows clear button when there is a query", () => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    });

    it("does not show clear button when query is empty", () => {
      render(<SearchBar />);

      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });

    it("clears search when clear button is clicked", async () => {
      const user = userEvent.setup();

      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      await user.click(screen.getByRole("button", { name: "Clear search" }));

      expect(mockClearSearch).toHaveBeenCalled();
    });
  });

  describe("Click outside behavior", () => {
    it("closes dropdown when clicking outside", async () => {
      const user = userEvent.setup();

      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(
        <div>
          <SearchBar />
          <button>Outside button</button>
        </div>
      );

      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Outside button" }));

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: mockResults,
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });
    });

    it("has proper combobox role and aria attributes", () => {
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(input).toHaveAttribute("aria-controls", "search-results");
    });

    it("updates aria-activedescendant when navigating", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");

      expect(input).toHaveAttribute("aria-activedescendant", "search-result-0");
    });

    it("results have option role", () => {
      render(<SearchBar />);

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(3);
    });

    it("selected result has aria-selected=true", async () => {
      const user = userEvent.setup();
      render(<SearchBar />);

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");

      const firstResult = screen.getByRole("option", { name: /Fix authentication bug/i });
      expect(firstResult).toHaveAttribute("aria-selected", "true");
    });

    it("listbox has proper label", () => {
      render(<SearchBar />);

      expect(screen.getByRole("listbox", { name: "Search results" })).toBeInTheDocument();
    });
  });

  describe("Snippet sanitization", () => {
    it("renders sanitized snippet with mark tags", () => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: [
          {
            id: "ticket-xss",
            title: "XSS Test",
            description: "Test XSS",
            status: "backlog",
            priority: "low",
            projectId: "proj-1",
            epicId: null,
            tags: null,
            snippet: "Test <mark>search</mark> result",
          },
        ],
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      // The mark tag should be rendered (visible as highlighted text)
      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveTextContent("Test search result");

      // Check that the mark element exists
      const markElement = listbox.querySelector("mark");
      expect(markElement).toBeInTheDocument();
      expect(markElement).toHaveTextContent("search");
    });

    it("escapes dangerous HTML in snippets", () => {
      mockUseSearch.mockReturnValue({
        query: "bug",
        results: [
          {
            id: "ticket-xss",
            title: "XSS Test",
            description: "Test XSS",
            status: "backlog",
            priority: "low",
            projectId: "proj-1",
            epicId: null,
            tags: null,
            snippet: '<script>alert("xss")</script> <mark>test</mark>',
          },
        ],
        loading: false,
        error: null,
        search: mockSearchFn,
        clearSearch: mockClearSearch,
      });

      render(<SearchBar />);

      // The script tag should be escaped, not executed
      const listbox = screen.getByRole("listbox");

      // Script should be escaped and visible as text, not as an element
      expect(listbox.querySelector("script")).not.toBeInTheDocument();

      // The mark tag should still work
      const markElement = listbox.querySelector("mark");
      expect(markElement).toBeInTheDocument();
    });
  });
});
