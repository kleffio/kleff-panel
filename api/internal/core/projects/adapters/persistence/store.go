package persistence

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/kleffio/platform/internal/core/projects/domain"
	"github.com/kleffio/platform/internal/core/projects/ports"
	"github.com/kleffio/platform/internal/shared/ids"
)

type PostgresProjectStore struct {
	db *sql.DB
}

func NewPostgresProjectStore(db *sql.DB) ports.ProjectRepository {
	return &PostgresProjectStore{db: db}
}

// ── Organization ─────────────────────────────────────────────────────────────

func (s *PostgresProjectStore) EnsureOrganization(ctx context.Context, organizationID, name string) error {
	if organizationID == "" {
		return fmt.Errorf("organization id is required")
	}
	if name == "" {
		name = "Organization " + organizationID
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO organizations (id, name, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
		organizationID,
		name,
	)
	if err != nil {
		return fmt.Errorf("ensure organization: %w", err)
	}
	return nil
}

// ── Projects ──────────────────────────────────────────────────────────────────

func (s *PostgresProjectStore) FindByID(ctx context.Context, id string) (*domain.Project, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, organization_id, slug, name, is_default, created_at, updated_at
		FROM projects WHERE id = $1`, id)
	return scanProject(row)
}

func (s *PostgresProjectStore) FindBySlug(ctx context.Context, organizationID, slug string) (*domain.Project, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, organization_id, slug, name, is_default, created_at, updated_at
		FROM projects WHERE organization_id = $1 AND slug = $2`, organizationID, slug)
	return scanProject(row)
}

func (s *PostgresProjectStore) ListByMember(ctx context.Context, userID string) ([]*domain.Project, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT p.id, p.organization_id, p.slug, p.name, p.is_default, p.created_at, p.updated_at
		FROM projects p
		INNER JOIN project_members pm ON pm.project_id = p.id
		WHERE pm.user_id = $1
		ORDER BY p.created_at ASC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list projects by member: %w", err)
	}
	defer rows.Close()
	var out []*domain.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *PostgresProjectStore) ListByOrganization(ctx context.Context, organizationID string) ([]*domain.Project, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, organization_id, slug, name, is_default, created_at, updated_at
		FROM projects
		WHERE organization_id = $1
		ORDER BY created_at ASC`, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	var out []*domain.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *PostgresProjectStore) Save(ctx context.Context, project *domain.Project) error {
	if project == nil {
		return fmt.Errorf("project is required")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO projects (id, organization_id, slug, name, is_default, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (id) DO UPDATE SET
			organization_id = EXCLUDED.organization_id,
			slug = EXCLUDED.slug,
			name = EXCLUDED.name,
			is_default = EXCLUDED.is_default,
			updated_at = EXCLUDED.updated_at`,
		project.ID,
		project.OrganizationID,
		project.Slug,
		project.Name,
		project.IsDefault,
		project.CreatedAt,
		project.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("save project: %w", err)
	}
	return nil
}

// ── Connections ───────────────────────────────────────────────────────────────

func (s *PostgresProjectStore) ListConnections(ctx context.Context, projectID string) ([]*domain.Connection, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, source_workload_id, target_workload_id, kind, label, created_at
		FROM project_connections
		WHERE project_id = $1
		ORDER BY created_at ASC`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list connections: %w", err)
	}
	defer rows.Close()

	var out []*domain.Connection
	for rows.Next() {
		c, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *PostgresProjectStore) FindConnection(ctx context.Context, connectionID string) (*domain.Connection, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, project_id, source_workload_id, target_workload_id, kind, label, created_at
		FROM project_connections WHERE id = $1`, connectionID)
	return scanConnection(row)
}

func (s *PostgresProjectStore) CreateConnection(ctx context.Context, conn *domain.Connection) error {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO project_connections
			(id, project_id, source_workload_id, target_workload_id, kind, label, created_at)
		SELECT $1,$2,$3,$4,$5,$6,$7
		WHERE EXISTS (
			SELECT 1 FROM workloads w1
			WHERE w1.id = $3 AND (w1.project_id = $2 OR w1.environment_id = $2)
		)
		  AND EXISTS (
			SELECT 1 FROM workloads w2
			WHERE w2.id = $4 AND (w2.project_id = $2 OR w2.environment_id = $2)
		)`,
		conn.ID,
		conn.ProjectID,
		conn.SourceWorkloadID,
		conn.TargetWorkloadID,
		conn.Kind,
		conn.Label,
		conn.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create connection: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("create connection rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *PostgresProjectStore) DeleteConnection(ctx context.Context, connectionID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM project_connections WHERE id = $1`, connectionID)
	if err != nil {
		return fmt.Errorf("delete connection: %w", err)
	}
	return nil
}

// ── Graph nodes ───────────────────────────────────────────────────────────────

func (s *PostgresProjectStore) ListGraphNodes(ctx context.Context, projectID string) ([]*domain.GraphNode, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, workload_id, position_x, position_y, updated_at
		FROM project_graph_nodes
		WHERE project_id = $1`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list graph nodes: %w", err)
	}
	defer rows.Close()

	var out []*domain.GraphNode
	for rows.Next() {
		n := &domain.GraphNode{}
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.WorkloadID, &n.PositionX, &n.PositionY, &n.UpdatedAt); err != nil {
			return nil, err
		}
		n.UpdatedAt = n.UpdatedAt.UTC()
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *PostgresProjectStore) UpsertGraphNode(ctx context.Context, node *domain.GraphNode) error {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO project_graph_nodes (id, project_id, workload_id, position_x, position_y, updated_at)
		SELECT $1,$2,$3,$4,$5,$6
		WHERE EXISTS (
			SELECT 1 FROM workloads w
			WHERE w.id = $3 AND (w.project_id = $2 OR w.environment_id = $2)
		)
		ON CONFLICT ON CONSTRAINT project_graph_nodes_unique DO UPDATE SET
			position_x = EXCLUDED.position_x,
			position_y = EXCLUDED.position_y,
			updated_at = EXCLUDED.updated_at`,
		node.ID,
		node.ProjectID,
		node.WorkloadID,
		node.PositionX,
		node.PositionY,
		time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("upsert graph node: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("upsert graph node rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ── Project members ───────────────────────────────────────────────────────────

func (s *PostgresProjectStore) ListMembers(ctx context.Context, projectID string) ([]*domain.ProjectMember, error) {
	namespaceID, nsErr := s.resolveNamespaceID(ctx, projectID)
	if nsErr == nil && namespaceID != "" {
		rows, err := s.db.QueryContext(ctx, `
			SELECT
				$1 AS project_id,
				nm.user_id,
				COALESCE(u.idp_subject, ''),
				COALESCE(up.username, ''),
				CASE WHEN LOWER(COALESCE(r.name, 'member')) = 'owner' THEN 'owner' ELSE 'developer' END,
				'',
				nm.created_at
			FROM namespace_members nm
			LEFT JOIN roles r ON r.id = nm.role_id
			LEFT JOIN users u ON u.id = nm.user_id
			LEFT JOIN user_profiles up ON up.user_id = nm.user_id
			WHERE nm.namespace_id = $2
			ORDER BY nm.created_at ASC`, projectID, namespaceID)
		if err == nil {
			defer rows.Close()
			var out []*domain.ProjectMember
			for rows.Next() {
				m, scanErr := scanMember(rows)
				if scanErr != nil {
					return nil, scanErr
				}
				out = append(out, m)
			}
			if rowsErr := rows.Err(); rowsErr != nil {
				return nil, rowsErr
			}
			if len(out) > 0 {
				return out, nil
			}
		}
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT project_id, user_id, email, display_name, role, invited_by, created_at
		FROM project_members WHERE project_id = $1 ORDER BY created_at ASC`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project members: %w", err)
	}
	defer rows.Close()
	var out []*domain.ProjectMember
	for rows.Next() {
		m, err := scanMember(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *PostgresProjectStore) GetMember(ctx context.Context, projectID, userID string) (*domain.ProjectMember, error) {
	namespaceID, nsErr := s.resolveNamespaceID(ctx, projectID)
	if nsErr == nil && namespaceID != "" {
		row := s.db.QueryRowContext(ctx, `
			SELECT
				$1 AS project_id,
				nm.user_id,
				COALESCE(u.idp_subject, ''),
				COALESCE(up.username, ''),
				CASE WHEN LOWER(COALESCE(r.name, 'member')) = 'owner' THEN 'owner' ELSE 'developer' END,
				'',
				nm.created_at
			FROM namespace_members nm
			LEFT JOIN roles r ON r.id = nm.role_id
			LEFT JOIN users u ON u.id = nm.user_id
			LEFT JOIN user_profiles up ON up.user_id = nm.user_id
			WHERE nm.namespace_id = $2 AND nm.user_id = $3`, projectID, namespaceID, userID)
		m, err := scanMember(row)
		if err == nil {
			return m, nil
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT project_id, user_id, email, display_name, role, invited_by, created_at
		FROM project_members WHERE project_id = $1 AND user_id = $2`, projectID, userID)
	return scanMember(row)
}

func (s *PostgresProjectStore) AddMember(ctx context.Context, m *domain.ProjectMember) error {
	namespaceID, nsErr := s.resolveNamespaceID(ctx, m.ProjectID)
	if nsErr == nil && namespaceID != "" {
		roleID, roleErr := s.resolveRoleIDForProjectRole(ctx, namespaceID, m.Role)
		if roleErr == nil && roleID != "" {
			_, err := s.db.ExecContext(ctx, `
				INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (namespace_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
				namespaceID, m.UserID, roleID, m.CreatedAt)
			if err != nil {
				return fmt.Errorf("add namespace member: %w", err)
			}
		}
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO project_members (project_id, user_id, email, display_name, role, invited_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (project_id, user_id) DO UPDATE SET
			role = EXCLUDED.role,
			display_name = EXCLUDED.display_name,
			email = EXCLUDED.email`,
		m.ProjectID, m.UserID, m.Email, m.DisplayName, m.Role, m.InvitedBy, m.CreatedAt)
	if err != nil {
		return fmt.Errorf("add project member: %w", err)
	}
	return nil
}

func (s *PostgresProjectStore) UpdateMemberRole(ctx context.Context, projectID, userID, role string) error {
	namespaceID, nsErr := s.resolveNamespaceID(ctx, projectID)
	updatedNamespace := false
	if nsErr == nil && namespaceID != "" {
		roleID, roleErr := s.resolveRoleIDForProjectRole(ctx, namespaceID, role)
		if roleErr == nil && roleID != "" {
			res, err := s.db.ExecContext(ctx,
				`UPDATE namespace_members SET role_id=$3 WHERE namespace_id=$1 AND user_id=$2`, namespaceID, userID, roleID)
			if err != nil {
				return fmt.Errorf("update namespace member role: %w", err)
			}
			nsRows, _ := res.RowsAffected()
			updatedNamespace = nsRows > 0
		}
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE project_members SET role=$3 WHERE project_id=$1 AND user_id=$2`, projectID, userID, role)
	if err != nil {
		return fmt.Errorf("update member role: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 && !updatedNamespace {
		return sql.ErrNoRows
	}
	return nil
}

func (s *PostgresProjectStore) RemoveMember(ctx context.Context, projectID, userID string) error {
	namespaceID, nsErr := s.resolveNamespaceID(ctx, projectID)
	if nsErr == nil && namespaceID != "" {
		_, _ = s.db.ExecContext(ctx,
			`DELETE FROM namespace_members WHERE namespace_id=$1 AND user_id=$2`, namespaceID, userID)
	}

	_, err := s.db.ExecContext(ctx,
		`DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, projectID, userID)
	return err
}

func (s *PostgresProjectStore) resolveNamespaceID(ctx context.Context, projectID string) (string, error) {
	var namespaceID string
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(
			(SELECT e.namespace_id FROM environments e WHERE e.id = $1),
			(SELECT p.organization_id FROM projects p WHERE p.id = $1),
			''
		)`, projectID).Scan(&namespaceID)
	if err != nil {
		return "", err
	}
	if namespaceID == "" {
		return "", sql.ErrNoRows
	}
	return namespaceID, nil
}

func (s *PostgresProjectStore) resolveRoleIDForProjectRole(ctx context.Context, namespaceID, role string) (string, error) {
	targetRole := "Member"
	if strings.EqualFold(role, domain.RoleOwner) {
		targetRole = "Owner"
	}

	var roleID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id
		FROM roles
		WHERE namespace_id = $1 AND LOWER(name) = LOWER($2)
		ORDER BY is_system DESC, created_at ASC
		LIMIT 1`, namespaceID, targetRole).Scan(&roleID)
	if err != nil {
		return "", err
	}
	return roleID, nil
}

// ── Project invites ───────────────────────────────────────────────────────────

func (s *PostgresProjectStore) ListInvites(ctx context.Context, projectID string) ([]*domain.ProjectInvite, error) {
	// Namespace-native fallback: try namespace_invites first if we can resolve a namespace_id.
	namespaceID, nsErr := s.resolveNamespaceID(ctx, projectID)
	if nsErr == nil && namespaceID != "" {
		rows, err := s.db.QueryContext(ctx, `
			SELECT
				i.id,
				$1 AS project_id,
				COALESCE(i.invited_email, '') AS invited_email,
				COALESCE(r.name, 'developer') AS role,
				i.invited_by,
				i.expires_at,
				i.accepted_at,
				i.created_at
			FROM namespace_invites i
			LEFT JOIN roles r ON r.id = i.role_id
			WHERE i.namespace_id = $2
			  AND i.accepted_at IS NULL
			  AND i.expires_at > NOW()
			ORDER BY i.created_at DESC`, projectID, namespaceID)
		if err == nil {
			defer rows.Close()
			var out []*domain.ProjectInvite
			for rows.Next() {
				inv, scanErr := scanInvite(rows)
				if scanErr != nil {
					return nil, scanErr
				}
				out = append(out, inv)
			}
			if rowsErr := rows.Err(); rowsErr != nil {
				return nil, rowsErr
			}
			if len(out) > 0 {
				return out, nil
			}
		}
	}

	// Legacy fallback: project_invites table.
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, invited_email, role, invited_by, expires_at, accepted_at, created_at
		FROM project_invites
		WHERE project_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
		ORDER BY created_at DESC`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project invites: %w", err)
	}
	defer rows.Close()
	var out []*domain.ProjectInvite
	for rows.Next() {
		inv, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

func (s *PostgresProjectStore) FindInviteByToken(ctx context.Context, tokenHash string) (*domain.ProjectInvite, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, project_id, invited_email, role, invited_by, expires_at, accepted_at, created_at
		FROM project_invites WHERE token_hash = $1`, tokenHash)
	return scanInvite(row)
}

func (s *PostgresProjectStore) FindActiveInviteByEmail(ctx context.Context, projectID, email string) (*domain.ProjectInvite, error) {
	// Namespace-native check first.
	namespaceID, nsErr := s.resolveNamespaceID(ctx, projectID)
	if nsErr == nil && namespaceID != "" {
		row := s.db.QueryRowContext(ctx, `
			SELECT
				i.id,
				$1 AS project_id,
				COALESCE(i.invited_email, '') AS invited_email,
				COALESCE(r.name, 'developer') AS role,
				i.invited_by,
				i.expires_at,
				i.accepted_at,
				i.created_at
			FROM namespace_invites i
			LEFT JOIN roles r ON r.id = i.role_id
			WHERE i.namespace_id = $2
			  AND LOWER(COALESCE(i.invited_email, '')) = LOWER($3)
			  AND i.accepted_at IS NULL AND i.expires_at > NOW()
			LIMIT 1`, projectID, namespaceID, email)
		if inv, err := scanInvite(row); err == nil {
			return inv, nil
		}
	}

	// Legacy fallback.
	row := s.db.QueryRowContext(ctx, `
		SELECT id, project_id, invited_email, role, invited_by, expires_at, accepted_at, created_at
		FROM project_invites
		WHERE project_id = $1 AND LOWER(invited_email) = LOWER($2)
		  AND accepted_at IS NULL AND expires_at > NOW()
		LIMIT 1`, projectID, email)
	return scanInvite(row)
}

func (s *PostgresProjectStore) CreateInvite(ctx context.Context, inv *domain.ProjectInvite) error {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return fmt.Errorf("generate invite token: %w", err)
	}
	token := hex.EncodeToString(raw)
	h := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(h[:])

	inv.ID = ids.New()
	inv.Token = token
	inv.TokenHash = tokenHash
	if inv.CreatedAt.IsZero() {
		inv.CreatedAt = time.Now().UTC()
	}
	if inv.ExpiresAt.IsZero() {
		inv.ExpiresAt = inv.CreatedAt.Add(7 * 24 * time.Hour)
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO project_invites (id, project_id, invited_email, role, token_hash, invited_by, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		inv.ID, inv.ProjectID, inv.InvitedEmail, inv.Role, tokenHash, inv.InvitedBy, inv.ExpiresAt, inv.CreatedAt)
	if err != nil {
		return fmt.Errorf("create project invite: %w", err)
	}
	return nil
}

func (s *PostgresProjectStore) AcceptInvite(ctx context.Context, tokenHash, userID, email, displayName string) (*domain.ProjectInvite, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var inv domain.ProjectInvite
	var acceptedAt sql.NullTime
	err = tx.QueryRowContext(ctx, `
		SELECT id, project_id, invited_email, role, invited_by, expires_at, accepted_at, created_at
		FROM project_invites WHERE token_hash = $1 FOR UPDATE`, tokenHash).Scan(
		&inv.ID, &inv.ProjectID, &inv.InvitedEmail, &inv.Role, &inv.InvitedBy, &inv.ExpiresAt, &acceptedAt, &inv.CreatedAt)
	if err != nil {
		return nil, err
	}
	if acceptedAt.Valid {
		return nil, fmt.Errorf("invite already accepted")
	}
	if time.Now().After(inv.ExpiresAt) {
		return nil, fmt.Errorf("invite expired")
	}

	now := time.Now().UTC()
	if _, err := tx.ExecContext(ctx,
		`UPDATE project_invites SET accepted_at=$2 WHERE id=$1`, inv.ID, now); err != nil {
		return nil, fmt.Errorf("mark invite accepted: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO project_members (project_id, user_id, email, display_name, role, invited_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (project_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
		inv.ProjectID, userID, email, displayName, inv.Role, inv.InvitedBy, now); err != nil {
		return nil, fmt.Errorf("add member on accept: %w", err)
	}

	// Dual-write to namespace_members so environment-era access checks work.
	// Best-effort: errors here do not roll back the invite acceptance.
	var namespaceID string
	_ = tx.QueryRowContext(ctx, `
		SELECT COALESCE(
			(SELECT e.namespace_id FROM environments e WHERE e.id = $1),
			(SELECT p.organization_id FROM projects p WHERE p.id = $1),
			''
		)`, inv.ProjectID).Scan(&namespaceID)
	if namespaceID != "" {
		targetRoleName := "Member"
		if strings.EqualFold(inv.Role, domain.RoleOwner) {
			targetRoleName = "Owner"
		}
		var nsRoleID string
		if err := tx.QueryRowContext(ctx, `
			SELECT id FROM roles
			WHERE namespace_id = $1 AND LOWER(name) = LOWER($2)
			ORDER BY is_system DESC, created_at ASC
			LIMIT 1`, namespaceID, targetRoleName).Scan(&nsRoleID); err == nil && nsRoleID != "" {
			_, _ = tx.ExecContext(ctx, `
				INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (namespace_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
				namespaceID, userID, nsRoleID, now)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit accept invite: %w", err)
	}

	inv.AcceptedAt = &now
	return &inv, nil
}

func (s *PostgresProjectStore) RevokeInvite(ctx context.Context, projectID, inviteID string) error {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM project_invites WHERE id=$1 AND project_id=$2 AND accepted_at IS NULL`, inviteID, projectID)
	if err != nil {
		return fmt.Errorf("revoke invite: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ── Scanners ──────────────────────────────────────────────────────────────────

type scanner interface {
	Scan(dest ...any) error
}

func scanProject(s scanner) (*domain.Project, error) {
	var p domain.Project
	if err := s.Scan(
		&p.ID,
		&p.OrganizationID,
		&p.Slug,
		&p.Name,
		&p.IsDefault,
		&p.CreatedAt,
		&p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	p.CreatedAt = p.CreatedAt.UTC()
	p.UpdatedAt = p.UpdatedAt.UTC()
	return &p, nil
}

func scanConnection(s scanner) (*domain.Connection, error) {
	var c domain.Connection
	if err := s.Scan(&c.ID, &c.ProjectID, &c.SourceWorkloadID, &c.TargetWorkloadID, &c.Kind, &c.Label, &c.CreatedAt); err != nil {
		return nil, err
	}
	c.CreatedAt = c.CreatedAt.UTC()
	return &c, nil
}

func scanMember(s scanner) (*domain.ProjectMember, error) {
	var m domain.ProjectMember
	if err := s.Scan(&m.ProjectID, &m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.InvitedBy, &m.CreatedAt); err != nil {
		return nil, err
	}
	m.CreatedAt = m.CreatedAt.UTC()
	return &m, nil
}

func scanInvite(s scanner) (*domain.ProjectInvite, error) {
	var inv domain.ProjectInvite
	var acceptedAt sql.NullTime
	if err := s.Scan(&inv.ID, &inv.ProjectID, &inv.InvitedEmail, &inv.Role, &inv.InvitedBy, &inv.ExpiresAt, &acceptedAt, &inv.CreatedAt); err != nil {
		return nil, err
	}
	inv.ExpiresAt = inv.ExpiresAt.UTC()
	inv.CreatedAt = inv.CreatedAt.UTC()
	if acceptedAt.Valid {
		t := acceptedAt.Time.UTC()
		inv.AcceptedAt = &t
	}
	return &inv, nil
}
