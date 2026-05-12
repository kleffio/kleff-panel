// Package ports defines the outbound interfaces for the users module.
package ports

import (
	"context"

	"github.com/kleffio/platform/internal/core/users/domain"
)

// UserProfileRepository is the persistence contract for user profiles.
type UserProfileRepository interface {
	// FindByUserID returns the profile for the given IDP subject. Returns
	// sql.ErrNoRows when no profile exists yet.
	FindByUserID(ctx context.Context, userID string) (*domain.UserProfile, error)

	// Save inserts a new profile row.
	Save(ctx context.Context, p *domain.UserProfile) error

	// Update persists mutable fields for an existing profile.
	Update(ctx context.Context, p *domain.UserProfile) error

	// FindByUsername returns the profile whose username matches. Returns
	// sql.ErrNoRows when no match is found.
	FindByUsername(ctx context.Context, username string) (*domain.UserProfile, error)
}
