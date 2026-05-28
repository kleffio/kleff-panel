package domain

import "time"

// Namespace is a unified identity — either a user or an org.
// User namespaces have ID == users.id. Org namespaces have their own ID.
type Namespace struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"` // "user" | "org"
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	UserRole    string    `json:"user_role,omitempty"` // populated on list for current user
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Permission is an atomic capability key (e.g. "workload:create").
type Permission struct {
	Key         string `json:"key"`
	Description string `json:"description"`
	Source      string `json:"source"` // "system" | "plugin:<id>"
}

// Role is a named group of permissions scoped to a namespace.
type Role struct {
	ID          string    `json:"id"`
	NamespaceID string    `json:"namespace_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsSystem    bool      `json:"is_system"`
	Permissions []string  `json:"permissions,omitempty"` // permission keys; populated on demand
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Member is a user's membership record in a namespace.
type Member struct {
	NamespaceID string    `json:"namespace_id"`
	UserID      string    `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	RoleID      string    `json:"role_id"`
	RoleName    string    `json:"role_name"`
	CreatedAt   time.Time `json:"created_at"`
}

// EnvAccessGrant records that a user has been explicitly granted access to an
// environment that has limited_access = true.
// RoleID, when set, overrides the member's NS role for permission checks within
// this specific environment.
type EnvAccessGrant struct {
	EnvironmentID string    `json:"environment_id"`
	UserID        string    `json:"user_id"`
	Email         string    `json:"email"`
	DisplayName   string    `json:"display_name"`
	GrantedBy     string    `json:"granted_by"`
	RoleID        string    `json:"role_id,omitempty"`
	RoleName      string    `json:"role_name,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// PermissionOverride is a per-user allow/deny that supplements the member's role.
type PermissionOverride struct {
	NamespaceID   string `json:"namespace_id"`
	UserID        string `json:"user_id"`
	PermissionKey string `json:"permission_key"`
	Effect        string `json:"effect"` // "allow" | "deny"
}

// Invite is a pending invitation to join a namespace.
// For email invites: InvitedEmail is set. For shareable links: MaxUses is set.
// GrantEnvironmentID, when set, auto-grants the new member access to that environment on accept.
type Invite struct {
	ID                 string     `json:"id"`
	NamespaceID        string     `json:"namespace_id"`
	RoleID             string     `json:"role_id"`
	RoleName           string     `json:"role_name,omitempty"`
	InvitedEmail       string     `json:"invited_email,omitempty"`
	MaxUses            *int       `json:"max_uses,omitempty"`
	UseCount           int        `json:"use_count"`
	Token              string     `json:"-"` // raw token — returned only at creation
	TokenHash          string     `json:"-"`
	InvitedBy          string     `json:"invited_by"`
	ExpiresAt          time.Time  `json:"expires_at"`
	AcceptedAt         *time.Time `json:"accepted_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	GrantEnvironmentID string     `json:"grant_environment_id,omitempty"`
}

// SharedProject is an environment the current user has explicit access to via an
// env_access_grant, but is NOT a direct member of the owning namespace.
// Used to surface "Shared with you" projects in the personal hub sidebar.
type SharedProject struct {
	NamespaceSlug string `json:"namespace_slug"`
	NamespaceName string `json:"namespace_name"`
	EnvID         string `json:"env_id"`
	EnvSlug       string `json:"env_slug"`
	EnvName       string `json:"env_name"`
}

// UserSearchResult is returned by the user search endpoint.
type UserSearchResult struct {
	UserID      string `json:"user_id"`
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
}

// APIKey is a namespace-scoped authentication key.
type APIKey struct {
	ID                string     `json:"id"`
	NamespaceID       string     `json:"namespace_id"`
	UserID            string     `json:"user_id"`
	Name              string     `json:"name"`
	KeyHash           string     `json:"-"`
	KeyPrefix         string     `json:"key_prefix"`
	ScopedPermissions []string   `json:"scoped_permissions,omitempty"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	LastUsedAt        *time.Time `json:"last_used_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}
