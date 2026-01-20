import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "./SearchBar";
import * as hooks from "../../lib/hooks";

vi.mock("../../lib/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("../../lib/hooks");
  return { ...actual, useSearch: vi.fn() };
});

const mockResults: hooks.SearchResult[] = [
  {
    id: "1",
    title: "Fix auth bug",
    description: "",
    status: "in_progress",
    priority: "high",
    projectId: "p1",
    epicId: null,
    tags: null,
    snippet: "Fix <mark>auth</mark> bug",
  },
  {
    id: "2",
    title: "Add dark mode",
    description: "",
    status: "backlog",
    priority: "medium",
    projectId: "p1",
    epicId: null,
    tags: null,
    snippet: "Add <mark>dark</mark> mode",
  },
  {
    id: "3",
    title: "API docs",
    description: "",
    status: "done",
    priority: "low",
    projectId: "p2",
    epicId: null,
    tags: null,
    snippet: "<mark>API</mark> docs",
  },
];

describe("SearchBar", () => {
  let mockSearch: ReturnType<typeof vi.fn>;
  let mockClear: ReturnType<typeof vi.fn>;
  let mockUseSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSearch = vi.fn();
    mockClear = vi.fn();
    mockUseSearch = hooks.useSearch as ReturnType<typeof vi.fn>;
    mockUseSearch.mockReturnValue({
      query: "",
      results: [],
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("renders search input", () => {
    render(<SearchBar />);
    expect(screen.getByRole("combobox", { name: "Search tickets" })).toBeInTheDocument();
  });

  it("calls search on typing", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByRole("combobox"), "bug");
    expect(mockSearch).toHaveBeenCalledTimes(3);
  });

  it("shows dropdown with results", () => {
    mockUseSearch.mockReturnValue({
      query: "bug",
      results: mockResults,
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });
    render(<SearchBar />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("shows loading and error states", () => {
    mockUseSearch.mockReturnValue({
      query: "x",
      results: [],
      loading: true,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });
    const { rerender } = render(<SearchBar />);
    expect(screen.getByText("Searching...")).toBeInTheDocument();

    mockUseSearch.mockReturnValue({
      query: "x",
      results: [],
      loading: false,
      error: "Failed",
      search: mockSearch,
      clearSearch: mockClear,
    });
    rerender(<SearchBar />);
    expect(screen.getByText("Search failed: Failed")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    mockUseSearch.mockReturnValue({
      query: "xyz",
      results: [],
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });
    render(<SearchBar />);
    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("keyboard navigation: arrow keys + enter selects result", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockUseSearch.mockReturnValue({
      query: "bug",
      results: mockResults,
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });

    render(<SearchBar onResultSelect={onSelect} />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");

    expect(onSelect).toHaveBeenCalledWith(mockResults[0]);
    expect(mockClear).toHaveBeenCalled();
  });

  it("escape closes dropdown", async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({
      query: "bug",
      results: mockResults,
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });

    render(<SearchBar />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("click result selects it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockUseSearch.mockReturnValue({
      query: "bug",
      results: mockResults,
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });

    render(<SearchBar onResultSelect={onSelect} />);
    await user.click(screen.getByText("Add dark mode"));
    expect(onSelect).toHaveBeenCalledWith(mockResults[1]);
  });

  it("clear button clears search", async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({
      query: "bug",
      results: mockResults,
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });

    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(mockClear).toHaveBeenCalled();
  });

  it("click outside closes dropdown", async () => {
    const user = userEvent.setup();
    mockUseSearch.mockReturnValue({
      query: "bug",
      results: mockResults,
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });

    render(
      <div>
        <SearchBar />
        <button>Outside</button>
      </div>
    );
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("sanitizes XSS in snippets", () => {
    mockUseSearch.mockReturnValue({
      query: "x",
      results: [{ ...mockResults[0], snippet: '<script>alert("xss")</script><mark>safe</mark>' }],
      loading: false,
      error: null,
      search: mockSearch,
      clearSearch: mockClear,
    });
    render(<SearchBar />);
    expect(screen.getByRole("listbox").querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByRole("listbox").querySelector("mark")).toBeInTheDocument();
  });
});
