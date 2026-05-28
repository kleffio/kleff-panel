import { get } from "./request";
import type { EnvironmentScope } from "./projects";

export interface LogLineDTO {
  id: number;
  workload_id: string;
  project_id: string;
  ts: string;
  stream: "stdout" | "stderr";
  line: string;
}

function logsPath(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  if (scope?.namespaceSlug && scope?.environmentSlug) {
    return `/api/v1/namespaces/${encodeURIComponent(scope.namespaceSlug)}/environments/${encodeURIComponent(scope.environmentSlug)}/workloads/${encodeURIComponent(workloadID)}/logs`;
  }
  if (scope?.namespaceSlug) {
    return `/api/v1/namespaces/${encodeURIComponent(scope.namespaceSlug)}/workloads/${encodeURIComponent(workloadID)}/logs`;
  }
  return `/api/v1/projects/${encodeURIComponent(projectID)}/workloads/${encodeURIComponent(workloadID)}/logs`;
}

export function getWorkloadLogs(projectID: string, workloadID: string, limit = 200, scope?: EnvironmentScope) {
  return get<{ lines: LogLineDTO[] }>(`${logsPath(projectID, workloadID, scope)}?limit=${limit}`);
}

export interface LokiLogLine {
  ts: string;
  line: string;
  stream: "stdout" | "stderr";
}

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][]; // [nanosecond unix ts, log line]
}

interface LokiQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: LokiStream[];
  };
}

export async function getWorkloadLogsFromLoki(
  workloadID: string,
  start: number, // unix nanoseconds
  end: number,   // unix nanoseconds
  limit = 200,
): Promise<LokiLogLine[]> {
  const query = `{workload_id="${workloadID}"}`;
  const params = new URLSearchParams({
    query,
    start: String(start),
    end: String(end),
    limit: String(limit),
    direction: "forward",
  });
  const res = await fetch(`/api/v1/logs/query_range?${params}`);
  if (!res.ok) throw new Error(`loki: ${res.status}`);
  const json: LokiQueryResponse = await res.json();
  const lines: LokiLogLine[] = [];
  for (const lokiStream of json.data?.result ?? []) {
    const streamLabel = lokiStream.stream["stream"] === "stderr" ? "stderr" : "stdout";
    for (const [nsTs, text] of lokiStream.values) {
      lines.push({
        ts: new Date(Number(nsTs) / 1_000_000).toISOString(),
        line: text,
        stream: streamLabel,
      });
    }
  }
  lines.sort((a, b) => a.ts.localeCompare(b.ts));
  return lines;
}
