import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { IssuesPage, type IssuesSearch } from "../components/issue/IssuesPage";

export const Route = createFileRoute("/_chat/issues")({
  validateSearch: (raw: Record<string, unknown>): IssuesSearch => ({
    state: raw.state === "all" || raw.state === "closed" ? raw.state : "open",
    involvement:
      raw.involvement === "assigned" ||
      raw.involvement === "authored" ||
      raw.involvement === "mentioned"
        ? raw.involvement
        : "all",
    ...(typeof raw.projectId === "string" ? { projectId: raw.projectId as ProjectId } : {}),
    ...(typeof raw.environmentId === "string"
      ? { environmentId: raw.environmentId as EnvironmentId }
      : {}),
    ...(typeof raw.selectedProjectId === "string"
      ? { selectedProjectId: raw.selectedProjectId as ProjectId }
      : {}),
    ...(typeof raw.selectedEnvironmentId === "string"
      ? { selectedEnvironmentId: raw.selectedEnvironmentId as EnvironmentId }
      : {}),
    ...(typeof raw.selectedHost === "string"
      ? { selectedHost: raw.selectedHost.slice(0, 200) }
      : {}),
    ...(typeof raw.repository === "string" ? { repository: raw.repository.slice(0, 200) } : {}),
    ...(typeof raw.host === "string" ? { host: raw.host.slice(0, 200) } : {}),
    ...(typeof raw.number === "number" && Number.isSafeInteger(raw.number) && raw.number > 0
      ? { number: raw.number }
      : {}),
    q: typeof raw.q === "string" ? raw.q.slice(0, 200) : undefined,
    ...(Array.isArray(raw.labels)
      ? {
          labels: raw.labels
            .filter((label): label is string => typeof label === "string" && label.length > 0)
            .slice(0, 10)
            .map((label) => label.slice(0, 200)),
        }
      : {}),
    group: raw.group === "state" || raw.group === "none" ? raw.group : "repository",
  }),
  component: IssuesPage,
});
