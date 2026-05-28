package ports

import (
	"context"

	"github.com/kleffio/platform/internal/core/namespaces/domain"
)

// NamespaceRepository covers all persistence operations for the namespaces module.
type NamespaceRepository interface {
	// Namespace CRUD
	FindByID(ctx context.Context, id string) (*domain.Namespace, error)
	FindBySlug(ctx context.Context, slug string) (*domain.Namespace, error)
	FindEnvironmentByNSAndSlug(ctx context.Context, namespaceID, envSlug string) (string, error)
	FindEnvironmentByID(ctx context.Context, envID string) (slug, name string, err error)
	ListByUserID(ctx context.Context, userID string) ([]*domain.Namespace, error)
	Save(ctx context.Context, ns *domain.Namespace) error
	Update(ctx context.Context, ns *domain.Namespace) error
	Delete(ctx context.Context, id string) error

	// Permissions
	ListPermissions(ctx context.Context) ([]*domain.Permission, error)

	// Roles
	ListRoles(ctx context.Context, namespaceID string) ([]*domain.Role, error)
	GetRole(ctx context.Context, roleID string) (*domain.Role, error)
	SaveRole(ctx context.Context, role *domain.Role) error
	UpdateRole(ctx context.Context, role *domain.Role) error
	DeleteRole(ctx context.Context, roleID string) error
	SetRolePermissions(ctx context.Context, roleID string, keys []string) error
	ListRolePermissions(ctx context.Context, roleID string) ([]string, error)

	// Members
	ListMembers(ctx context.Context, namespaceID string) ([]*domain.Member, error)
	GetMember(ctx context.Context, namespaceID, userID string) (*domain.Member, error)
	AddMember(ctx context.Context, m *domain.Member) error
	UpdateMemberRole(ctx context.Context, namespaceID, userID, roleID string) error
	RemoveMember(ctx context.Context, namespaceID, userID string) error

	// Environment Access (Vercel model: additive grants on limited-access environments)
	GetEnvironmentLimitedAccess(ctx context.Context, environmentID string) (bool, error)
	SetEnvironmentLimitedAccess(ctx context.Context, environmentID string, limited bool) error
	ListEnvironmentGrants(ctx context.Context, environmentID string) ([]*domain.EnvAccessGrant, error)
	AddEnvironmentGrant(ctx context.Context, environmentID, userID, grantedBy, roleID string) error
	RemoveEnvironmentGrant(ctx context.Context, environmentID, userID string) error
	HasEnvironmentGrant(ctx context.Context, environmentID, userID string) (bool, error)

	// Permission overrides
	ListOverrides(ctx context.Context, namespaceID, userID string) ([]*domain.PermissionOverride, error)
	SetOverride(ctx context.Context, o *domain.PermissionOverride) error
	DeleteOverride(ctx context.Context, namespaceID, userID, permissionKey string) error

	// Invites
	ListInvites(ctx context.Context, namespaceID string) ([]*domain.Invite, error)
	CreateInvite(ctx context.Context, inv *domain.Invite) error
	FindInviteByToken(ctx context.Context, tokenHash string) (*domain.Invite, error)
	RevokeInvite(ctx context.Context, inviteID string) error
	AcceptInvite(ctx context.Context, inviteID, userID, email, displayName string) error
	IncrementInviteUseCount(ctx context.Context, inviteID, userID, email, displayName string) error


	// HasPermission resolves whether a user holds a permission in a namespace
	// after applying role permissions and overrides. If environmentID is provided,
	// it also checks for environment-level memberships.
	HasPermission(ctx context.Context, namespaceID, userID, permissionKey, environmentID string) (bool, error)
	ListEffectivePermissions(ctx context.Context, namespaceID, userID, environmentID string) ([]string, error)

	// EnsurePersonalNamespace creates a user-type namespace for the given user if one
	// does not already exist. It is idempotent and safe to call on every login.
	EnsurePersonalNamespace(ctx context.Context, userID, slug, name string) error

	// EnsurePersonalMemberPermissions seeds the minimum view permissions to the Member
	// role of a personal namespace. Safe to call on every request — uses ON CONFLICT DO NOTHING.
	EnsurePersonalMemberPermissions(ctx context.Context, namespaceID string) error

	// FindUserIDByEmail returns the platform user ID for a given email address.
	// Returns ("", sql.ErrNoRows) when no user is found.
	FindUserIDByEmail(ctx context.Context, email string) (string, error)

	// IsNamespaceMember returns whether userID is a direct member of namespaceID.
	IsNamespaceMember(ctx context.Context, namespaceID, userID string) (bool, error)

	// ListSharedProjects returns environments that userID has an explicit env_access_grant
	// for but is NOT a member of the owning namespace. These are "shared with you" projects.
	ListSharedProjects(ctx context.Context, userID string) ([]*domain.SharedProject, error)

	// SearchUsers finds platform users whose slug, display_name, or email contains the query.
	// Excludes excludeUserID (the caller) and limits to 10 results.
	SearchUsers(ctx context.Context, query, excludeUserID string) ([]*domain.UserSearchResult, error)
}
