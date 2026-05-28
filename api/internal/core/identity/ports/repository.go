package ports

import (
	"context"

	"github.com/kleffio/platform/internal/core/identity/domain"
)

// UserRepository is the persistence port for PlatformUser aggregates.
type UserRepository interface {
	// GetOrCreate returns the platform user for (issuer, subject).
	// On first call for a pair it inserts a new row with the provided slug.
	// If the slug conflicts with an existing user, a numeric suffix is appended.
	GetOrCreate(ctx context.Context, issuer, subject, slug string) (*domain.PlatformUser, error)

	// FindByID returns the user with the given platform ID.
	FindByID(ctx context.Context, id string) (*domain.PlatformUser, error)

	// SetPersonalOrg records which organization is this user's personal org.
	SetPersonalOrg(ctx context.Context, userID, orgID string) error
}

// OrgBootstrapper creates the personal organization for a newly-registered user.
// Implemented by the organizations persistence store to avoid coupling the
// identity package to the organizations domain.
type OrgBootstrapper interface {
	EnsurePersonalOrg(ctx context.Context, userID, orgName, email, displayName string) (orgID string, err error)
}

// NsBootstrapper provisions the personal namespace for a newly-registered user.
// Implemented by the namespaces persistence store.
type NsBootstrapper interface {
	EnsurePersonalNamespace(ctx context.Context, userID, slug, name string) error
}
