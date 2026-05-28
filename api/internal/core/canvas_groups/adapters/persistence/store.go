package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/kleffio/platform/internal/core/canvas_groups/domain"
	"github.com/kleffio/platform/internal/core/canvas_groups/ports"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) ports.Repository {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) ListByNamespace(ctx context.Context, namespaceID string) ([]*domain.CanvasGroup, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, namespace_id, label, color, member_ids, notes, role,
		       pos_x, pos_y, width, height, created_at, updated_at
		FROM canvas_groups
		WHERE namespace_id = $1
		ORDER BY created_at ASC
	`, namespaceID)
	if err != nil {
		return nil, fmt.Errorf("list canvas groups: %w", err)
	}
	defer rows.Close()

	var out []*domain.CanvasGroup
	for rows.Next() {
		g, err := scanGroup(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (s *PostgresStore) Upsert(ctx context.Context, g *domain.CanvasGroup) error {
	memberIDs := g.MemberIDs
	if memberIDs == nil {
		memberIDs = []string{}
	}
	membersJSON, err := json.Marshal(memberIDs)
	if err != nil {
		return fmt.Errorf("marshal member_ids: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO canvas_groups (id, namespace_id, label, color, member_ids, notes, role, pos_x, pos_y, width, height)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (id) DO UPDATE SET
			label      = EXCLUDED.label,
			color      = EXCLUDED.color,
			member_ids = EXCLUDED.member_ids,
			notes      = EXCLUDED.notes,
			role       = EXCLUDED.role,
			pos_x      = EXCLUDED.pos_x,
			pos_y      = EXCLUDED.pos_y,
			width      = EXCLUDED.width,
			height     = EXCLUDED.height,
			updated_at = NOW()
	`, g.ID, g.NamespaceID, g.Label, g.Color, membersJSON, g.Notes, g.Role, g.PosX, g.PosY, g.Width, g.Height)
	return err
}

func (s *PostgresStore) Delete(ctx context.Context, id string, namespaceID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM canvas_groups WHERE id = $1 AND namespace_id = $2`, id, namespaceID)
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanGroup(s scanner) (*domain.CanvasGroup, error) {
	g := &domain.CanvasGroup{}
	var membersJSON []byte
	err := s.Scan(
		&g.ID, &g.NamespaceID, &g.Label, &g.Color, &membersJSON, &g.Notes, &g.Role,
		&g.PosX, &g.PosY, &g.Width, &g.Height, &g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan canvas group: %w", err)
	}
	if err := json.Unmarshal(membersJSON, &g.MemberIDs); err != nil {
		g.MemberIDs = []string{}
	}
	return g, nil
}
