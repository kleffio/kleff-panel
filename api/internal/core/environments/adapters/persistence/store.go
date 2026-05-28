package persistence

import (
    "context"
    "database/sql"
    "fmt"
    "time"

    "github.com/kleffio/platform/internal/core/environments/domain"
)

type PostgresEnvironmentStore struct{
    db *sql.DB
}

func NewPostgresEnvironmentStore(db *sql.DB) *PostgresEnvironmentStore {
    return &PostgresEnvironmentStore{db: db}
}

func (s *PostgresEnvironmentStore) FindByID(ctx context.Context, id string) (*domain.Environment, error) {
    row := s.db.QueryRowContext(ctx, `
        SELECT id, namespace_id, slug, name, description, is_private, profile, created_at, updated_at
        FROM environments WHERE id = $1`, id)
    var e domain.Environment
    if err := row.Scan(&e.ID, &e.NamespaceID, &e.Slug, &e.Name, &e.Description, &e.IsPrivate, &e.Profile, &e.CreatedAt, &e.UpdatedAt); err != nil {
        return nil, err
    }
    return &e, nil
}

func (s *PostgresEnvironmentStore) FindByNamespaceAndSlug(ctx context.Context, namespaceID, slug string) (*domain.Environment, error) {
    row := s.db.QueryRowContext(ctx, `
        SELECT id, namespace_id, slug, name, description, is_private, profile, created_at, updated_at
        FROM environments WHERE namespace_id = $1 AND slug = $2`, namespaceID, slug)
    var e domain.Environment
    if err := row.Scan(&e.ID, &e.NamespaceID, &e.Slug, &e.Name, &e.Description, &e.IsPrivate, &e.Profile, &e.CreatedAt, &e.UpdatedAt); err != nil {
        return nil, err
    }
    return &e, nil
}

func (s *PostgresEnvironmentStore) ListByNamespace(ctx context.Context, namespaceID string) ([]*domain.Environment, error) {
    rows, err := s.db.QueryContext(ctx, `
        SELECT id, namespace_id, slug, name, description, is_private, profile, created_at, updated_at
        FROM environments WHERE namespace_id = $1 ORDER BY created_at ASC`, namespaceID)
    if err != nil {
        return nil, fmt.Errorf("list environments: %w", err)
    }
    defer rows.Close()
    var out []*domain.Environment
    for rows.Next() {
        var e domain.Environment
        if err := rows.Scan(&e.ID, &e.NamespaceID, &e.Slug, &e.Name, &e.Description, &e.IsPrivate, &e.Profile, &e.CreatedAt, &e.UpdatedAt); err != nil {
            return nil, err
        }
        out = append(out, &e)
    }
    return out, rows.Err()
}

func (s *PostgresEnvironmentStore) Save(ctx context.Context, e *domain.Environment) error {
    now := time.Now().UTC()
    if e.CreatedAt.IsZero() { e.CreatedAt = now }
    e.UpdatedAt = now
    if e.Profile == "" {
        e.Profile = "simple"
    }
    _, err := s.db.ExecContext(ctx, `
        INSERT INTO environments (id, namespace_id, slug, name, description, is_private, profile, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        e.ID, e.NamespaceID, e.Slug, e.Name, e.Description, e.IsPrivate, e.Profile, e.CreatedAt, e.UpdatedAt)
    if err != nil {
        return fmt.Errorf("save environment: %w", err)
    }
    return nil
}

func (s *PostgresEnvironmentStore) Update(ctx context.Context, e *domain.Environment) error {
    e.UpdatedAt = time.Now().UTC()
    _, err := s.db.ExecContext(ctx, `
        UPDATE environments SET name=$1, description=$2, is_private=$3, profile=$4, updated_at=$5 WHERE id = $6`,
        e.Name, e.Description, e.IsPrivate, e.Profile, e.UpdatedAt, e.ID)
    if err != nil {
        return fmt.Errorf("update environment: %w", err)
    }
    return nil
}

func (s *PostgresEnvironmentStore) Delete(ctx context.Context, id string) error {
    _, err := s.db.ExecContext(ctx, `DELETE FROM environments WHERE id = $1`, id)
    if err != nil {
        return fmt.Errorf("delete environment: %w", err)
    }
    return nil
}
