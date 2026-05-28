import { get } from "./request";
import type { EnvironmentScope } from "./projects";

export interface WorkloadMetricsDTO {
  workload_id: string;
  workload_name?: string;
  project_id: string;
  cpu_millicores: number;
  memory_mb: number;
  network_in_kbps: number;
  network_out_kbps: number;
  disk_read_kbps: number;
  disk_write_kbps: number;
  recorded_at: string;
  cpu_limit_millicores: number;
  memory_limit_bytes: number;
}

export function getProjectMetrics(projectID: string, scope?: EnvironmentScope) {
  let query: string;
  if (scope?.namespaceSlug && scope?.environmentSlug) {
    query = `environment_id=${encodeURIComponent(projectID)}`;
  } else if (scope?.namespaceSlug) {
    query = `namespace_slug=${encodeURIComponent(scope.namespaceSlug)}`;
  } else {
    query = `project_id=${encodeURIComponent(projectID)}`;
  }
  return get<{ workloads: WorkloadMetricsDTO[] }>(`/api/v1/usage/metrics?${query}`);
}

export function getAllMetrics() {
  return get<{ workloads: WorkloadMetricsDTO[] }>(`/api/v1/admin/usage/metrics`);
}
