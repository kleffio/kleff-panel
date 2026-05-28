import type { ApiResponse } from "@/types/common";
import type { UserProfile, PublicProfile, UpdateProfilePayload } from "@/types/user";
import { get, patch } from "./request";
import { getApiAccessToken } from "./token";

const BASE = "/api/v1/users";

/**
 * Fetches the current user's profile.
 *
 * Kratos integration note: the backend uses Lazy Creation — if this is the
 * user's first request after registering via Kratos, the backend automatically
 * bootstraps a default profile row keyed by their Kratos identity.id (the
 * OIDC `sub` claim on the access token).
 */
export function getMyProfile(): Promise<ApiResponse<UserProfile>> {
  return get<ApiResponse<UserProfile>>(`${BASE}/me`);
}

/**
 * Fetches the public profile for a given username (unauthenticated).
 */
export function getPublicProfile(username: string): Promise<ApiResponse<PublicProfile>> {
  return get<ApiResponse<PublicProfile>>(`${BASE}/${username}`);
}

/**
 * Updates mutable profile fields (bio, theme_preference).
 * Omitted fields are left unchanged on the server.
 */
export function updateMyProfile(
  payload: UpdateProfilePayload
): Promise<ApiResponse<UserProfile>> {
  return patch<ApiResponse<UserProfile>, UpdateProfilePayload>(
    `${BASE}/me`,
    payload
  );
}

/**
 * Uploads a new avatar image. Sends as multipart/form-data.
 * The backend stores the file and returns the updated profile with the new avatar_url.
 */
export async function uploadAvatar(file: File): Promise<ApiResponse<UserProfile>> {
  const form = new FormData();
  form.append("avatar", file);
  const token = getApiAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/me/avatar`, {
    method: "POST",
    body: form,
    headers,
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json as ApiResponse<UserProfile>;
}
