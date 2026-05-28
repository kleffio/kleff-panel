import type { ISODateString, UUID } from "./common";

export type ThemePreference = "light" | "dark" | "system";

// Application-level profile stored in our database — holds avatar, bio, and preferences.
// The `id` field equals the OIDC `sub` claim.
export type UIMode = "simple" | "advanced";

export interface UserProfile {
  id: UUID;
  username?: string;
  avatar_url?: string;
  bio?: string;
  theme_preference: ThemePreference;
  ui_mode: UIMode;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface PublicProfile {
  username?: string;
  avatar_url?: string;
  bio?: string;
}

export interface UpdateProfilePayload {
  bio?: string;
  theme_preference?: ThemePreference;
  ui_mode?: UIMode;
}
