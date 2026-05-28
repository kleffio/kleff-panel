import { get, post, put, del, patch } from "./request";

export interface EnvironmentScope {
  namespaceSlug: string;
  environmentSlug?: string;
}

function workloadBasePath(projectID: string, scope?: EnvironmentScope) {
  if (scope?.namespaceSlug && scope?.environmentSlug) {
    return `/api/v1/namespaces/${encodeURIComponent(scope.namespaceSlug)}/environments/${encodeURIComponent(scope.environmentSlug)}/workloads`;
  }
  if (scope?.namespaceSlug) {
    return `/api/v1/namespaces/${encodeURIComponent(scope.namespaceSlug)}/workloads`;
  }
  return `/api/v1/projects/${projectID}/workloads`;
}

function workloadSinglePath(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  return `${workloadBasePath(projectID, scope)}/${encodeURIComponent(workloadID)}`;
}

export interface ProjectDTO {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkloadDTO {
  id: string;
  name: string;
  namespace_id: string;
  organization_id: string;
  project_id: string;
  owner_id: string;
  blueprint_id: string;
  image: string;
  runtime_ref: string;
  endpoint: string;
  node_id: string;
  state: "pending" | "running" | "stopped" | "deleted" | "failed";
  error_message: string;
  cpu_millicores: number;
  memory_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectionDTO {
  id: string;
  project_id: string;
  source_workload_id: string;
  target_workload_id: string;
  kind: "network" | "dependency" | "traffic";
  label: string;
  created_at: string;
}

export interface GraphNodeDTO {
  id: string;
  project_id: string;
  workload_id: string;
  position_x: number;
  position_y: number;
  updated_at: string;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function listProjects(organizationID?: string) {
  const suffix = organizationID
    ? `?organization_id=${encodeURIComponent(organizationID)}`
    : "";
  return get<{ projects: ProjectDTO[] }>(`/api/v1/projects${suffix}`);
}

export function createProject(payload: {
  organization_id?: string;
  name: string;
  slug?: string;
}) {
  return post<ProjectDTO, typeof payload>("/api/v1/projects", payload);
}

export function getProject(projectID: string) {
  return get<ProjectDTO>(`/api/v1/projects/${projectID}`);
}

// ── Workloads ─────────────────────────────────────────────────────────────────

export function listWorkloads(projectID: string, scope?: EnvironmentScope) {
  return get<{ workloads: WorkloadDTO[] }>(
    workloadBasePath(projectID, scope)
  );
}

/** Phase 1: List all workloads directly under a namespace (no environment required). */
export function listWorkloadsByNamespace(namespaceSlug: string) {
  return get<{ workloads: WorkloadDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(namespaceSlug)}/workloads`
  );
}

/** Phase 1: Provision a workload directly under a namespace (no environment required). */
export function provisionWorkloadForNamespace(
  namespaceSlug: string,
  payload: {
    owner_id?: string;
    server_name?: string;
    blueprint_id?: string;
    image?: string;
    env_overrides?: Record<string, string>;
    memory_bytes?: number;
    cpu_millicores?: number;
  }
) {
  return post<{ workload_id: string; deployment_id: string }, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(namespaceSlug)}/workloads`,
    payload
  );
}

/** Phase 1: Delete a workload by namespace slug + workload ID. */
export function deleteWorkloadFromNamespace(namespaceSlug: string, workloadID: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(namespaceSlug)}/workloads/${encodeURIComponent(workloadID)}`
  );
}


export function getWorkload(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  return get<WorkloadDTO>(workloadSinglePath(projectID, workloadID, scope));
}

export function restartWorkload(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  return post<void, undefined>(`${workloadSinglePath(projectID, workloadID, scope)}/restart`, undefined);
}

export function startWorkload(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  return post<void, undefined>(`${workloadSinglePath(projectID, workloadID, scope)}/start`, undefined);
}

export function stopWorkload(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  return post<void, undefined>(`${workloadSinglePath(projectID, workloadID, scope)}/stop`, undefined);
}


export function provisionWorkload(
  projectID: string,
  payload: {
    owner_id?: string;
    blueprint_id?: string;
    image: string;
    env_overrides?: Record<string, string>;
    memory_bytes?: number;
    cpu_millicores?: number;
  },
  scope?: EnvironmentScope,
) {
  return post<{ workload_id: string; deployment_id: string }, typeof payload>(
    workloadBasePath(projectID, scope),
    payload
  );
}

export function deleteWorkload(projectID: string, workloadID: string, scope?: EnvironmentScope) {
  return del<void>(
    `${workloadBasePath(projectID, scope)}/${encodeURIComponent(workloadID)}`
  );
}

// ── Connections ───────────────────────────────────────────────────────────────

export function listConnections(projectID: string) {
  return get<{ connections: ConnectionDTO[] }>(
    `/api/v1/projects/${projectID}/connections`
  );
}

export function createConnection(
  projectID: string,
  payload: {
    source_workload_id: string;
    target_workload_id: string;
    kind: "network" | "dependency" | "traffic";
    label?: string;
  }
) {
  return post<ConnectionDTO, typeof payload>(
    `/api/v1/projects/${projectID}/connections`,
    payload
  );
}

export function deleteConnection(projectID: string, connectionID: string) {
  return del<void>(
    `/api/v1/projects/${projectID}/connections/${encodeURIComponent(connectionID)}`
  );
}

// ── Graph node positions ──────────────────────────────────────────────────────

export function listGraphNodes(projectID: string) {
  return get<{ graph_nodes: GraphNodeDTO[] }>(
    `/api/v1/projects/${projectID}/graph-nodes`
  );
}

export function upsertGraphNode(
  projectID: string,
  workloadID: string,
  position: { position_x: number; position_y: number }
) {
  return put<GraphNodeDTO, typeof position>(
    `/api/v1/projects/${projectID}/graph-nodes/${encodeURIComponent(workloadID)}`,
    position
  );
}

// ── Project members ───────────────────────────────────────────────────────────

export interface ProjectMemberDTO {
  project_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  invited_by: string;
  created_at: string;
}

export interface ProjectInviteDTO {
  id: string;
  project_id: string;
  invited_email: string;
  role: string;
  token?: string;
  invited_by: string;
  expires_at: string;
  accepted_at?: string;
  created_at: string;
}

export function listProjectMembers(projectID: string) {
  return get<{ members: ProjectMemberDTO[] }>(`/api/v1/projects/${projectID}/members`);
}

export function addProjectMember(
  projectID: string,
  payload: { user_id: string; email?: string; display_name?: string; role?: string }
) {
  return post<ProjectMemberDTO, typeof payload>(`/api/v1/projects/${projectID}/members`, payload);
}

export function updateProjectMemberRole(projectID: string, userID: string, role: string) {
  return patch<void, { role: string }>(
    `/api/v1/projects/${projectID}/members/${encodeURIComponent(userID)}`,
    { role }
  );
}

export function removeProjectMember(projectID: string, userID: string) {
  return del<void>(`/api/v1/projects/${projectID}/members/${encodeURIComponent(userID)}`);
}

export function listProjectInvites(projectID: string) {
  return get<{ invites: ProjectInviteDTO[] }>(`/api/v1/projects/${projectID}/invites`);
}

export function createProjectInvite(projectID: string, payload: { email: string; role?: string }) {
  return post<ProjectInviteDTO, typeof payload>(`/api/v1/projects/${projectID}/invites`, payload);
}

export function revokeProjectInvite(projectID: string, inviteID: string) {
  return del<void>(`/api/v1/projects/${projectID}/invites/${encodeURIComponent(inviteID)}`);
}

export function resolveProjectInvite(token: string) {
  return get<{
    id: string;
    project_id: string;
    project_name?: string;
    project_slug?: string;
    invited_email: string;
    role: string;
    expires_at: string;
  }>(`/api/v1/project-invites/${encodeURIComponent(token)}`);
}

export function acceptProjectInvite(token: string) {
  return post<{ project_id: string; project_slug?: string }, Record<string, never>>(
    `/api/v1/project-invites/${encodeURIComponent(token)}/accept`,
    {}
  );
}
