package persistence

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/kleffio/platform/internal/core/identity/domain"
	"github.com/kleffio/platform/internal/core/identity/ports"
	"github.com/kleffio/platform/internal/shared/ids"
)

// PostgresUserStore implements ports.UserRepository.
type PostgresUserStore struct {
	db *sql.DB
}

// NewPostgresUserStore returns a store backed by db.
func NewPostgresUserStore(db *sql.DB) ports.UserRepository {
	return &PostgresUserStore{db: db}
}

func (s *PostgresUserStore) GetOrCreate(ctx context.Context, issuer, subject, slug string) (*domain.PlatformUser, error) {
	// Fast path: user already exists.
	u, err := s.findByIdentity(ctx, issuer, subject)
	if err == nil {
		return u, nil
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("get or create user: %w", err)
	}

	// Compatibility path for existing sessions backfilled with idp_issuer=''.
	u, err = s.claimLegacyIdentity(ctx, issuer, subject)
	if err == nil {
		return u, nil
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("get or create user: %w", err)
	}

	// Slow path: first login — insert a new row, handling slug conflicts.
	id := ids.New()
	resolvedSlug := slug
	for attempt := 0; attempt < 10; attempt++ {
		candidate := resolvedSlug
		if attempt > 0 {
			candidate = fmt.Sprintf("%s-%d", slug, attempt+1)
		}
		inserted, insertErr := s.tryInsert(ctx, id, issuer, subject, candidate)
		if insertErr == nil {
			return inserted, nil
		}
		if errors.Is(insertErr, sql.ErrNoRows) {
			// No row inserted (identity conflict race or org slug conflict).
			u, err = s.findByIdentity(ctx, issuer, subject)
			if err == nil {
				return u, nil
			}
			continue
		}
		if !isUniqueViolation(insertErr) {
			return nil, fmt.Errorf("get or create user: %w", insertErr)
		}
		// slug conflict — check if the row now exists (race with another request)
		u, err = s.findByIdentity(ctx, issuer, subject)
		if err == nil {
			return u, nil
		}
		// genuine slug conflict, try next suffix
	}
	return nil, fmt.Errorf("get or create user: could not find a unique slug after retries")
}

func (s *PostgresUserStore) tryInsert(ctx context.Context, id, issuer, subject, slug string) (*domain.PlatformUser, error) {
	now := time.Now().UTC()
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO users (id, idp_issuer, idp_subject, slug, created_at)
		SELECT $1, $2, $3, $4, $5
		WHERE NOT EXISTS (
			SELECT 1 FROM organizations o WHERE o.slug = $4
		)
		ON CONFLICT (idp_issuer, idp_subject) DO NOTHING
		RETURNING id, idp_issuer, idp_subject, slug, is_platform_admin,
		          COALESCE(personal_org_id, ''), created_at`,
		id, issuer, subject, slug, now)
	return scanUser(row)
}

func (s *PostgresUserStore) claimLegacyIdentity(ctx context.Context, issuer, subject string) (*domain.PlatformUser, error) {
	legacy, err := s.findByIdentity(ctx, "", subject)
	if err != nil {
		return nil, err
	}
	if issuer == "" {
		return legacy, nil
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE users
		SET idp_issuer = $1
		WHERE id = $2 AND idp_issuer = ''`, issuer, legacy.ID)
	if err != nil {
		if isUniqueViolation(err) {
			return s.findByIdentity(ctx, issuer, subject)
		}
		return nil, err
	}

	updated, err := s.findByIdentity(ctx, issuer, subject)
	if err == nil {
		return updated, nil
	}
	return legacy, nil
}

func (s *PostgresUserStore) findByIdentity(ctx context.Context, issuer, subject string) (*domain.PlatformUser, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, idp_issuer, idp_subject, slug, is_platform_admin,
		       COALESCE(personal_org_id, ''), created_at
		FROM users
		WHERE idp_issuer = $1 AND idp_subject = $2`, issuer, subject)
	return scanUser(row)
}

func (s *PostgresUserStore) FindByID(ctx context.Context, id string) (*domain.PlatformUser, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, idp_issuer, idp_subject, slug, is_platform_admin,
		       COALESCE(personal_org_id, ''), created_at
		FROM users WHERE id = $1`, id)
	u, err := scanUser(row)
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}
	return u, nil
}

func (s *PostgresUserStore) SetPersonalOrg(ctx context.Context, userID, orgID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET personal_org_id = $1 WHERE id = $2`, orgID, userID)
	if err != nil {
		return fmt.Errorf("set personal org: %w", err)
	}
	return nil
}

func scanUser(row *sql.Row) (*domain.PlatformUser, error) {
	var u domain.PlatformUser
	return &u, row.Scan(
		&u.ID, &u.IDPIssuer, &u.IDPSubject,
		&u.Slug, &u.IsPlatformAdmin, &u.PersonalOrgID, &u.CreatedAt,
	)
}

// isUniqueViolation reports whether err is a Postgres unique-constraint violation (23505).
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "23505")
}
