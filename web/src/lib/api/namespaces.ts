import { get, post, put, patch, del } from "./request";
import { apiClient } from "./client";

// ── Namespaces ────────────────────────────────────────────────────────────────

export interface NamespaceDTO {
  id: string;
  type: "user" | "org";
  slug: string;
  name: string;
  description?: string;
  avatar_url?: string;
  user_role?: string;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentDTO {
  id: string;
  namespace_id: string;
  slug: string;
  name: string;
  description?: string;
  is_private: boolean;
  profile?: "simple" | "advanced";
  created_at: string;
  updated_at: string;
}

export interface NsMemberDTO {
  namespace_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role_id: string;
  role_name: string;
  created_at: string;
}

export interface NsInviteDTO {
  id: string;
  namespace_id: string;
  role_id?: string;
  role_name?: string;
  invited_email?: string;
  max_uses?: number;
  use_count: number;
  invited_by: string;
  token?: string;
  expires_at: string;
  accepted_at?: string;
  created_at: string;
  grant_environment_id?: string;
}

export interface EnvAccessGrantDTO {
  environment_id: string;
  user_id: string;
  email: string;
  display_name: string;
  granted_by: string;
  role_id?: string;
  role_name?: string;
  created_at: string;
}

// ── Namespace CRUD ─────────────────────────────────────────────────────────

export function listNamespaces() {
  return get<{ namespaces: NamespaceDTO[] }>("/api/v1/namespaces");
}

export function checkSlugAvailable(slug: string) {
  return get<{ available: boolean }>(
    `/api/v1/namespaces/slug-check?slug=${encodeURIComponent(slug)}`
  );
}

export function getNamespace(slug: string) {
  return get<NamespaceDTO>(`/api/v1/namespaces/${encodeURIComponent(slug)}`);
}

export function createNamespace(payload: { name: string; slug?: string; description?: string; type?: "user" | "org" }) {
  return post<NamespaceDTO, typeof payload>("/api/v1/namespaces", payload);
}

export function updateNamespace(
  slug: string,
  payload: { name?: string; description?: string; avatar_url?: string }
) {
  return patch<NamespaceDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}`,
    payload
  );
}

export function deleteNamespace(slug: string) {
  return del<void>(`/api/v1/namespaces/${encodeURIComponent(slug)}`);
}

export function getMyPermissions(slug: string, envId?: string) {
  const query = envId ? `?env_id=${encodeURIComponent(envId)}` : "";
  return get<{ permissions: string[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/my-permissions${query}`
  );
}

// ── Namespace members ──────────────────────────────────────────────────────

export function listNamespaceMembers(slug: string) {
  return get<{ members: NsMemberDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/members`
  );
}

export function updateNamespaceMemberRole(slug: string, userId: string, roleId: string) {
  return patch<{ role_id: string }, { role_id: string }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
    { role_id: roleId }
  );
}

export function removeNamespaceMember(slug: string, userId: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`
  );
}

// ── Namespace invites ──────────────────────────────────────────────────────

export function listNamespaceInvites(slug: string) {
  return get<{ invites: NsInviteDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/invites`
  );
}

export function createNamespaceInvite(
  slug: string,
  payload: { email?: string; role_id?: string; max_uses?: number; days?: number; grant_environment_id?: string }
) {
  return post<NsInviteDTO & { token: string }, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/invites`,
    payload
  );
}

export function revokeNamespaceInvite(slug: string, inviteId: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/invites/${encodeURIComponent(inviteId)}`
  );
}

export function resolveNsInvite(token: string) {
  return get<{
    id: string;
    namespace_id: string;
    namespace_name: string;
    namespace_slug: string;
    role_id?: string;
    role_name?: string;
    invited_email?: string;
    expires_at: string;
    grant_environment_id?: string;
    grant_environment_slug?: string;
  }>(`/api/v1/ns-invites/${encodeURIComponent(token)}`);
}

export function acceptNsInvite(token: string) {
  return post<{ namespace_id: string }, Record<string, never>>(
    `/api/v1/ns-invites/${encodeURIComponent(token)}/accept`,
    {}
  );
}

// ── Environments ───────────────────────────────────────────────────────────

export function listEnvironments(nsSlug: string) {
  return get<{ environments: EnvironmentDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments`
  );
}

export function getEnvironment(nsSlug: string, envSlug: string) {
  return get<EnvironmentDTO>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}`
  );
}

export function createEnvironment(
  nsSlug: string,
  payload: { name: string; slug?: string; description?: string; is_private?: boolean }
) {
  return post<EnvironmentDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments`,
    payload
  );
}

export function updateEnvironment(
  nsSlug: string,
  envSlug: string,
  payload: { name?: string; description?: string; is_private?: boolean; profile?: "simple" | "advanced" }
) {
  return patch<EnvironmentDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}`,
    payload
  );
}

export function deleteEnvironment(nsSlug: string, envSlug: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}`
  );
}

// ── Environment Access Grants ──────────────────────────────────────────────

export function listEnvironmentGrants(nsSlug: string, envSlug: string) {
  return get<{ limited_access: boolean; grants: EnvAccessGrantDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}/access`
  );
}

export function addEnvironmentGrant(nsSlug: string, envSlug: string, userId: string, roleId?: string) {
  return post<{ user_id: string; role_id: string }, { user_id: string; role_id?: string }>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}/access`,
    { user_id: userId, role_id: roleId }
  );
}

export function removeEnvironmentGrant(nsSlug: string, envSlug: string, userId: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}/access/${encodeURIComponent(userId)}`
  );
}

export function setEnvironmentLimitedAccess(nsSlug: string, envSlug: string, limitedAccess: boolean) {
  return patch<{ limited_access: boolean }, { limited_access: boolean }>(
    `/api/v1/namespaces/${encodeURIComponent(nsSlug)}/environments/${encodeURIComponent(envSlug)}/access/settings`,
    { limited_access: limitedAccess }
  );
}

// ── Namespace resource quota ───────────────────────────────────────────────

export interface NamespaceQuotaDTO {
  cpu_millicores: number;
  memory_mb: number;
}

export function getNamespaceQuota(slug: string) {
  return get<NamespaceQuotaDTO>(`/api/v1/namespaces/${encodeURIComponent(slug)}/quota`);
}

export function setNamespaceQuota(slug: string, payload: { cpu_millicores: number; memory_mb: number }) {
  return put<NamespaceQuotaDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/quota`,
    payload
  );
}

// ── User Search ────────────────────────────────────────────────────────────

export interface UserSearchResultDTO {
  user_id: string;
  slug: string;
  display_name: string;
  email: string;
}

export async function uploadNamespaceAvatar(slug: string, file: File) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await apiClient.post<{ avatar_url: string }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/avatar`,
    form,
  );
  return res.data;
}

export function searchUsers(query: string) {
  return get<{ users: UserSearchResultDTO[] }>(
    `/api/v1/users/search?q=${encodeURIComponent(query)}`
  );
}

// ── Shared Projects (env grants with no NS membership) ─────────────────────

export interface SharedProjectDTO {
  namespace_slug: string;
  namespace_name: string;
  env_id: string;
  env_slug: string;
  env_name: string;
}

export function listSharedProjects() {
  return get<{ projects: SharedProjectDTO[] }>("/api/v1/me/shared-projects");
}

// ── Permissions ────────────────────────────────────────────────────────────

export interface PermissionDTO {
  key: string;
  description: string;
  source: string;
}

export function listPermissions() {
  return get<{ permissions: PermissionDTO[] }>("/api/v1/permissions");
}

// ── Roles ──────────────────────────────────────────────────────────────────

export interface RoleDTO {
  id: string;
  namespace_id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions?: string[];
  created_at: string;
  updated_at: string;
}

export function listRoles(slug: string) {
  return get<{ roles: RoleDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/roles`
  );
}

export function createRole(
  slug: string,
  payload: { name: string; description?: string }
) {
  return post<RoleDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/roles`,
    payload
  );
}

export function updateRole(
  slug: string,
  roleId: string,
  payload: { name?: string; description?: string }
) {
  return patch<RoleDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/roles/${encodeURIComponent(roleId)}`,
    payload
  );
}

export function deleteRole(slug: string, roleId: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/roles/${encodeURIComponent(roleId)}`
  );
}

export function listRolePermissions(slug: string, roleId: string) {
  return get<{ permissions: string[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/roles/${encodeURIComponent(roleId)}/permissions`
  );
}

export function setRolePermissions(slug: string, roleId: string, keys: string[]) {
  return put<void, { permissions: string[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/roles/${encodeURIComponent(roleId)}/permissions`,
    { permissions: keys }
  );
}

// ── Per-member permission overrides ────────────────────────────────────────

export interface OverrideDTO {
  namespace_id: string;
  user_id: string;
  permission_key: string;
  effect: "allow" | "deny";
}

export function listOverrides(slug: string, userId: string) {
  return get<{ overrides: OverrideDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/overrides`
  );
}

export function setOverride(
  slug: string,
  userId: string,
  permKey: string,
  effect: "allow" | "deny"
) {
  return put<void, { effect: "allow" | "deny" }>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/overrides/${encodeURIComponent(permKey)}`,
    { effect }
  );
}

export function deleteOverride(slug: string, userId: string, permKey: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/overrides/${encodeURIComponent(permKey)}`
  );
}
