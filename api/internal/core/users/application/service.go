// Package application contains the use-case logic for the users module.
package application

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/kleffio/platform/internal/core/users/domain"
	"github.com/kleffio/platform/internal/core/users/ports"
	"github.com/kleffio/platform/internal/shared/ids"
)

// Service orchestrates user-profile operations.
type Service struct {
	repo ports.UserProfileRepository
}

// NewService creates a Service.
func NewService(repo ports.UserProfileRepository) *Service {
	return &Service{repo: repo}
}

// GetOrCreate returns the profile for userID, bootstrapping a default row on
// first access (lazy creation pattern).
func (s *Service) GetOrCreate(ctx context.Context, userID, username string) (*domain.UserProfile, error) {
	p, err := s.repo.FindByUserID(ctx, userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if p != nil {
		return p, nil
	}

	now := time.Now().UTC()
	var un *string
	if username != "" {
		un = &username
	}
	p = &domain.UserProfile{
		ID:              ids.New(),
		UserID:          userID,
		Username:        un,
		ThemePreference: domain.ThemeSystem,
		UIMode:          domain.UIModeSimple,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.repo.Save(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// GetPublicProfile returns the publicly visible portion of a profile by username.
func (s *Service) GetPublicProfile(ctx context.Context, username string) (*domain.UserProfile, error) {
	return s.repo.FindByUsername(ctx, username)
}

// Update applies in to the profile identified by userID.
func (s *Service) Update(ctx context.Context, userID string, in domain.UpdateInput) (*domain.UserProfile, error) {
	p, err := s.repo.FindByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if in.Bio != nil {
		p.Bio = in.Bio
	}
	if in.ThemePreference != nil {
		p.ThemePreference = *in.ThemePreference
	}
	if in.AvatarURL != nil {
		p.AvatarURL = in.AvatarURL
	}
	if in.UIMode != nil {
		p.UIMode = *in.UIMode
	}
	p.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}
