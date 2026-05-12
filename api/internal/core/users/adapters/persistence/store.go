// Package persistence provides the PostgreSQL implementation of UserProfileRepository.
package persistence

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/kleffio/platform/internal/core/users/domain"
	"github.com/kleffio/platform/internal/core/users/ports"
)

// PostgresUserProfileStore implements ports.UserProfileRepository.
type PostgresUserProfileStore struct {
	db *sql.DB
}

// NewPostgresUserProfileStore returns a store backed by db.
func NewPostgresUserProfileStore(db *sql.DB) ports.UserProfileRepository {
	return &PostgresUserProfileStore{db: db}
}

func (s *PostgresUserProfileStore) FindByUserID(ctx context.Context, userID string) (*domain.UserProfile, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, username, avatar_url, bio, theme_preference, ui_mode, created_at, updated_at
		FROM user_profiles
		WHERE user_id = $1`, userID)

	var p domain.UserProfile
	err := row.Scan(
		&p.ID, &p.UserID, &p.Username, &p.AvatarURL, &p.Bio,
		&p.ThemePreference, &p.UIMode, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *PostgresUserProfileStore) Save(ctx context.Context, p *domain.UserProfile) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO user_profiles (id, user_id, username, avatar_url, bio, theme_preference, ui_mode, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		p.ID, p.UserID, p.Username, p.AvatarURL, p.Bio,
		string(p.ThemePreference), string(p.UIMode), p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("save user profile: %w", err)
	}
	return nil
}

func (s *PostgresUserProfileStore) FindByUsername(ctx context.Context, username string) (*domain.UserProfile, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, username, avatar_url, bio, theme_preference, ui_mode, created_at, updated_at
		FROM user_profiles
		WHERE username = $1`, username)

	var p domain.UserProfile
	err := row.Scan(
		&p.ID, &p.UserID, &p.Username, &p.AvatarURL, &p.Bio,
		&p.ThemePreference, &p.UIMode, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *PostgresUserProfileStore) Update(ctx context.Context, p *domain.UserProfile) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE user_profiles
		SET username = $1, avatar_url = $2, bio = $3, theme_preference = $4, ui_mode = $5, updated_at = $6
		WHERE user_id = $7`,
		p.Username, p.AvatarURL, p.Bio, string(p.ThemePreference), string(p.UIMode), p.UpdatedAt, p.UserID,
	)
	if err != nil {
		return fmt.Errorf("update user profile: %w", err)
	}
	return nil
}
