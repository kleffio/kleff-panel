import { get, post, del } from "./request";
import type { EnvironmentScope } from "./projects";

export interface ResourceOverride {
  memory_mb: number;
  cpu_millicores: number;
}

export interface CreateDeploymentPayload {
  blueprint_id: string;
  server_name: string;
  config: Record<string, string>;
  resources?: ResourceOverride;
}

export interface Deployment {
  id: string;
  server_name: string;
  status: "pending" | "in_progress" | "restarting" | "succeeded" | "failed" | "rolled_back";
  address: string;
  created_at: string;
}

function workloadsPath(projectID: string, scope?: EnvironmentScope) {
  if (scope?.namespaceSlug && scope?.environmentSlug) {
    return `/api/v1/namespaces/${encodeURIComponent(scope.namespaceSlug)}/environments/${encodeURIComponent(scope.environmentSlug)}/workloads`;
  }
  return `/api/v1/projects/${projectID}/workloads`;
}

interface WorkloadDTO {
  id: string;
  name: string;
  endpoint: string;
  state: "pending" | "running" | "stopped" | "deleted" | "failed";
  created_at: string;
}

function toDeploymentStatus(state: WorkloadDTO["state"]): Deployment["status"] {
  switch (state) {
    case "running":
      return "succeeded";
    case "stopped":
      return "rolled_back";
    case "failed":
      return "failed";
    case "deleted":
      return "rolled_back";
    default:
      return "pending";
  }
}

export function createDeployment(projectID: string, payload: CreateDeploymentPayload, scope?: EnvironmentScope) {
  return post<{ deployment_id: string }, CreateDeploymentPayload>(
    workloadsPath(projectID, scope),
    payload
  );
}

export async function listDeployments(projectID: string, scope?: EnvironmentScope) {
  if (!projectID) {
    return [];
  }
  const response = await get<{ workloads: WorkloadDTO[] }>(
    workloadsPath(projectID, scope)
  );
  return (response.workloads ?? [])
    .filter((workload) => workload.state !== "deleted")
    .map((workload) => ({
      id: workload.id,
      server_name: workload.name || workload.id,
      status: toDeploymentStatus(workload.state),
      address: workload.endpoint,
      created_at: workload.created_at,
    }));
}

export function deleteDeployment(projectID: string, id: string, scope?: EnvironmentScope) {
  return del<void>(`${workloadsPath(projectID, scope)}/${id}`);
}

export function stopServer(projectID: string, id: string, scope?: EnvironmentScope) {
  return post<void, undefined>(`${workloadsPath(projectID, scope)}/${id}/stop`, undefined);
}

export function startServer(projectID: string, id: string, scope?: EnvironmentScope) {
  return post<void, undefined>(`${workloadsPath(projectID, scope)}/${id}/start`, undefined);
}

export function restartServer(projectID: string, id: string, scope?: EnvironmentScope) {
  return post<void, undefined>(`${workloadsPath(projectID, scope)}/${id}/restart`, undefined);
}
