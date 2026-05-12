import { get, post, patch, del } from "./request";

export interface OrgDTO {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMemberDTO {
  org_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface OrgInviteDTO {
  id: string;
  org_id: string;
  invited_email: string;
  role: "owner" | "admin" | "member";
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export interface CreateInviteResponse {
  invite: OrgInviteDTO;
  token: string;
}

// ── Organizations ─────────────────────────────────────────────────────────────

export function listOrganizations() {
  return get<{ organizations: OrgDTO[] }>("/api/v1/organizations");
}

export function createOrganization(name: string) {
  return post<OrgDTO, { name: string }>("/api/v1/organizations", { name });
}

// ── Members ───────────────────────────────────────────────────────────────────

export function listMembers(orgID: string) {
  return get<{ members: OrgMemberDTO[] }>(`/api/v1/organizations/${orgID}/members`);
}

export function addMember(orgID: string, payload: { user_id: string; role: string }) {
  return post<OrgMemberDTO, typeof payload>(`/api/v1/organizations/${orgID}/members`, payload);
}

export function updateMemberRole(orgID: string, userID: string, role: string) {
  return patch<OrgMemberDTO, { role: string }>(
    `/api/v1/organizations/${orgID}/members/${encodeURIComponent(userID)}`,
    { role }
  );
}

export function removeMember(orgID: string, userID: string) {
  return del<void>(`/api/v1/organizations/${orgID}/members/${encodeURIComponent(userID)}`);
}

// ── Invites ───────────────────────────────────────────────────────────────────

export function listInvites(orgID: string) {
  return get<{ invites: OrgInviteDTO[] }>(`/api/v1/organizations/${orgID}/invites`);
}

export function createInvite(orgID: string, payload: { email: string; role: string }) {
  return post<CreateInviteResponse, typeof payload>(
    `/api/v1/organizations/${orgID}/invites`,
    payload
  );
}

export function revokeInvite(orgID: string, inviteID: string) {
  return del<void>(`/api/v1/organizations/${orgID}/invites/${encodeURIComponent(inviteID)}`);
}

// ── Public invite resolution ──────────────────────────────────────────────────

export interface InviteDetailsDTO {
  org_id: string;
  org_name: string;
  invited_email: string;
  role: string;
  invited_by: string;
  expires_at: string;
}

export function resolveInvite(token: string) {
  return get<InviteDetailsDTO>(`/api/v1/invites/${encodeURIComponent(token)}`);
}

export function acceptInvite(token: string) {
  return post<{ message: string }, undefined>(
    `/api/v1/invites/${encodeURIComponent(token)}/accept`
  );
}
