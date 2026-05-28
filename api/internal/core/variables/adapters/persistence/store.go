package persistence

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/kleffio/platform/internal/core/variables/domain"
)

type PostgresVariableStore struct {
	db *sql.DB
}

func NewPostgresVariableStore(db *sql.DB) *PostgresVariableStore {
	return &PostgresVariableStore{db: db}
}

func (s *PostgresVariableStore) ListByEnvironment(ctx context.Context, environmentID string) ([]*domain.Variable, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, environment_id, key, value, is_secret, created_at, updated_at
		FROM environment_variables WHERE environment_id = $1 ORDER BY key ASC`, environmentID)
	if err != nil {
		return nil, fmt.Errorf("list variables: %w", err)
	}
	defer rows.Close()
	var out []*domain.Variable
	for rows.Next() {
		var v domain.Variable
		if err := rows.Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value, &v.IsSecret, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, &v)
	}
	return out, rows.Err()
}

func (s *PostgresVariableStore) FindByID(ctx context.Context, id string) (*domain.Variable, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, environment_id, key, value, is_secret, created_at, updated_at
		FROM environment_variables WHERE id = $1`, id)
	var v domain.Variable
	if err := row.Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value, &v.IsSecret, &v.CreatedAt, &v.UpdatedAt); err != nil {
		return nil, err
	}
	return &v, nil
}

func (s *PostgresVariableStore) Save(ctx context.Context, v *domain.Variable) error {
	now := time.Now().UTC()
	if v.CreatedAt.IsZero() {
		v.CreatedAt = now
	}
	v.UpdatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO environment_variables (id, environment_id, key, value, is_secret, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		v.ID, v.EnvironmentID, v.Key, v.Value, v.IsSecret, v.CreatedAt, v.UpdatedAt)
	if err != nil {
		return fmt.Errorf("save variable: %w", err)
	}
	return nil
}

func (s *PostgresVariableStore) Update(ctx context.Context, v *domain.Variable) error {
	v.UpdatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		UPDATE environment_variables SET key=$1, value=$2, is_secret=$3, updated_at=$4 WHERE id=$5`,
		v.Key, v.Value, v.IsSecret, v.UpdatedAt, v.ID)
	if err != nil {
		return fmt.Errorf("update variable: %w", err)
	}
	return nil
}

func (s *PostgresVariableStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM environment_variables WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("delete variable: %w", err)
	}
	return nil
}
