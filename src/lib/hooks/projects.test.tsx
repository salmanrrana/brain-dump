import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { queryKeys } from "../query-keys";
import { useUpdateProjectPosition } from "./projects";
import type { ProjectWithEpics } from "./projects";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockUpdateProjectPosition = vi.hoisted(() => vi.fn());

vi.mock("../../api/projects", () => ({
  updateProjectPosition: mockUpdateProjectPosition,
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve: resolve as (value: T) => void,
    reject: reject as (error: Error) => void,
  };
}

function createWrapper(seedProjects: ProjectWithEpics[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  queryClient.setQueryData(queryKeys.projectsWithEpics, seedProjects);

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, wrapper: Wrapper };
}

function ProjectListFixture() {
  const queryClient = useQueryClient();
  const query = useQuery<ProjectWithEpics[]>({
    queryKey: queryKeys.projectsWithEpics,
    queryFn: async () =>
      queryClient.getQueryData<ProjectWithEpics[]>(queryKeys.projectsWithEpics) ?? [],
    initialData: queryClient.getQueryData(queryKeys.projectsWithEpics) ?? [],
  });

  const reorderMutation = useUpdateProjectPosition();

  return (
    <div>
      <button
        type="button"
        onClick={() => reorderMutation.mutate({ id: "project-a", position: 0 })}
      >
        Reorder
      </button>
      <ol aria-label="project-list">
        {(query.data ?? []).map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ol>
    </div>
  );
}

function getProjectOrder() {
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

describe("useUpdateProjectPosition", () => {
  const baseTimestamp = "2026-06-20T00:00:00.000Z";
  const seedProjects: ProjectWithEpics[] = [
    {
      id: "project-b",
      name: "Project B",
      path: "/tmp/b",
      color: null,
      workingMethod: "auto",
      position: 1,
      createdAt: baseTimestamp,
      epics: [],
    },
    {
      id: "project-a",
      name: "Project A",
      path: "/tmp/a",
      color: null,
      workingMethod: "auto",
      position: 2,
      createdAt: baseTimestamp,
      epics: [],
    },
  ];

  beforeEach(() => {
    mockShowToast.mockReset();
    mockUpdateProjectPosition.mockReset();
  });

  it("updates project order optimistically while the mutation is in-flight", async () => {
    const user = userEvent.setup();
    const updateResult = {
      id: "project-a",
      name: "Project A",
      path: "/tmp/a",
      color: null,
      position: 0,
      workingMethod: "auto",
      createdAt: baseTimestamp,
      epics: [],
    };

    const deferred = createDeferred<ProjectWithEpics>();
    mockUpdateProjectPosition.mockReturnValue(deferred.promise);

    render(<ProjectListFixture />, {
      wrapper: createWrapper(seedProjects).wrapper,
    });

    expect(getProjectOrder()).toEqual(["Project B", "Project A"]);

    await user.click(screen.getByRole("button", { name: /reorder/i }));
    expect(getProjectOrder()).toEqual(["Project A", "Project B"]);

    await act(async () => {
      deferred.resolve(updateResult);
    });

    await waitFor(() => {
      expect(mockUpdateProjectPosition).toHaveBeenCalledTimes(1);
      expect(mockUpdateProjectPosition).toHaveBeenCalledWith({
        data: { id: "project-a", position: 0 },
      });
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  it("rolls back the optimistic reorder and shows an error on mutation failure", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<ProjectWithEpics>();
    mockUpdateProjectPosition.mockReturnValue(deferred.promise);

    render(<ProjectListFixture />, {
      wrapper: createWrapper(seedProjects).wrapper,
    });

    await user.click(screen.getByRole("button", { name: /reorder/i }));
    expect(getProjectOrder()).toEqual(["Project A", "Project B"]);

    await act(async () => {
      deferred.reject(new Error("Permission denied"));
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "error",
        "Unable to reorder project: Permission denied"
      );
      expect(getProjectOrder()).toEqual(["Project B", "Project A"]);
    });
  });
});
