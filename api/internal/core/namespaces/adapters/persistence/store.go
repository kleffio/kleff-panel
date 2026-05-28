package persistence

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/kleffio/platform/internal/core/namespaces/domain"
	"github.com/kleffio/platform/internal/shared/ids"
	"github.com/lib/pq"
)

// ErrSlugTaken is returned when a namespace slug is already in use.
var ErrSlugTaken = errors.New("slug already taken")

// PostgresNamespaceStore implements ports.NamespaceRepository.
type PostgresNamespaceStore struct {
	db *sql.DB
}

func NewPostgresNamespaceStore(db *sql.DB) *PostgresNamespaceStore {
	return &PostgresNamespaceStore{db: db}
}

// ── Namespace CRUD ────────────────────────────────────────────────────────────

func (s *PostgresNamespaceStore) FindByID(ctx context.Context, id string) (*domain.Namespace, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, type, slug, name, description, avatar_url, created_at, updated_at
		FROM namespaces WHERE id = $1`, id)
	return scanNamespace(row)
}

func (s *PostgresNamespaceStore) FindBySlug(ctx context.Context, slug string) (*domain.Namespace, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, type, slug, name, description, avatar_url, created_at, updated_at
		FROM namespaces WHERE slug = $1`, slug)
	return scanNamespace(row)
}

func (s *PostgresNamespaceStore) ListByUserID(ctx context.Context, userID string) ([]*domain.Namespace, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT n.id, n.type, n.slug, n.name, n.description, n.avatar_url, n.created_at, n.updated_at,
		       COALESCE(r.name, '') as user_role
		FROM namespaces n
		JOIN namespace_members m ON m.namespace_id = n.id AND m.user_id = $1
		LEFT JOIN roles r ON r.id = m.role_id
		ORDER BY n.id, r.name NULLS LAST, n.created_at ASC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list namespaces by user: %w", err)
	}
	defer rows.Close()
	return scanNamespaces(rows)
}

func (s *PostgresNamespaceStore) FindEnvironmentByNSAndSlug(ctx context.Context, namespaceID, envSlug string) (string, error) {
	var envID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id FROM environments WHERE namespace_id = $1 AND slug = $2`, namespaceID, envSlug).Scan(&envID)
	if err != nil {
		return "", err
	}
	return envID, nil
}

func (s *PostgresNamespaceStore) FindEnvironmentByID(ctx context.Context, envID string) (slug, name string, err error) {
	err = s.db.QueryRowContext(ctx, `
		SELECT slug, name FROM environments WHERE id = $1`, envID).Scan(&slug, &name)
	return
}

func (s *PostgresNamespaceStore) Save(ctx context.Context, ns *domain.Namespace) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO namespaces (id, type, slug, name, description, avatar_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		ns.ID, ns.Type, ns.Slug, ns.Name, ns.Description, ns.AvatarURL, ns.CreatedAt, ns.UpdatedAt)
	if err != nil {
		return fmt.Errorf("save namespace: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) Update(ctx context.Context, ns *domain.Namespace) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE namespaces
		SET name = $1, description = $2, avatar_url = $3, updated_at = $4
		WHERE id = $5`,
		ns.Name, ns.Description, ns.AvatarURL, ns.UpdatedAt, ns.ID)
	if err != nil {
		return fmt.Errorf("update namespace: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM namespaces WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete namespace: %w", err)
	}
	return nil
}

// SlugAvailable returns true if no namespace or registered user currently uses the given slug.
func (s *PostgresNamespaceStore) SlugAvailable(ctx context.Context, slug string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM (
			SELECT 1 FROM namespaces WHERE slug = $1
			UNION ALL
			SELECT 1 FROM users WHERE slug = $1
		) AS combined`, slug).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check slug availability: %w", err)
	}
	return count == 0, nil
}

// ── Permissions ───────────────────────────────────────────────────────────────

func (s *PostgresNamespaceStore) ListPermissions(ctx context.Context) ([]*domain.Permission, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT key, description, source FROM permissions ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("list permissions: %w", err)
	}
	defer rows.Close()
	var out []*domain.Permission
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.Key, &p.Description, &p.Source); err != nil {
			return nil, err
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}

// ── Roles ─────────────────────────────────────────────────────────────────────

func (s *PostgresNamespaceStore) ListRoles(ctx context.Context, namespaceID string) ([]*domain.Role, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, namespace_id, name, description, is_system, created_at, updated_at
		FROM roles WHERE namespace_id = $1 ORDER BY created_at ASC`, namespaceID)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()
	return scanRoles(rows)
}

func (s *PostgresNamespaceStore) GetRole(ctx context.Context, roleID string) (*domain.Role, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, namespace_id, name, description, is_system, created_at, updated_at
		FROM roles WHERE id = $1`, roleID)
	var r domain.Role
	if err := row.Scan(&r.ID, &r.NamespaceID, &r.Name, &r.Description,
		&r.IsSystem, &r.CreatedAt, &r.UpdatedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *PostgresNamespaceStore) SaveRole(ctx context.Context, role *domain.Role) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO roles (id, namespace_id, name, description, is_system, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		role.ID, role.NamespaceID, role.Name, role.Description, role.IsSystem,
		role.CreatedAt, role.UpdatedAt)
	if err != nil {
		return fmt.Errorf("save role: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) UpdateRole(ctx context.Context, role *domain.Role) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE roles SET name = $1, description = $2, updated_at = $3 WHERE id = $4`,
		role.Name, role.Description, role.UpdatedAt, role.ID)
	if err != nil {
		return fmt.Errorf("update role: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) DeleteRole(ctx context.Context, roleID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM roles WHERE id = $1 AND is_system = FALSE`, roleID)
	if err != nil {
		return fmt.Errorf("delete role: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) SetRolePermissions(ctx context.Context, roleID string, keys []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return fmt.Errorf("clear role permissions: %w", err)
	}
	for _, k := range keys {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			roleID, k); err != nil {
			return fmt.Errorf("insert role permission %s: %w", k, err)
		}
	}
	return tx.Commit()
}

func (s *PostgresNamespaceStore) ListRolePermissions(ctx context.Context, roleID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT permission_key FROM role_permissions WHERE role_id = $1 ORDER BY permission_key`, roleID)
	if err != nil {
		return nil, fmt.Errorf("list role permissions: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// ── Members ───────────────────────────────────────────────────────────────────

func (s *PostgresNamespaceStore) ListMembers(ctx context.Context, namespaceID string) ([]*domain.Member, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.namespace_id, m.user_id,
		       COALESCE(u_email.email, ''), COALESCE(u_name.display_name, ''),
		       m.role_id, COALESCE(r.name, ''), m.created_at
		FROM namespace_members m
		LEFT JOIN users u ON u.id = m.user_id
		LEFT JOIN LATERAL (
			SELECT om.email FROM organization_members om WHERE om.user_id = m.user_id LIMIT 1
		) u_email ON TRUE
		LEFT JOIN LATERAL (
			SELECT om.display_name FROM organization_members om WHERE om.user_id = m.user_id LIMIT 1
		) u_name ON TRUE
		LEFT JOIN roles r ON r.id = m.role_id
		WHERE m.namespace_id = $1
		ORDER BY m.created_at ASC`, namespaceID)
	if err != nil {
		return nil, fmt.Errorf("list namespace members: %w", err)
	}
	defer rows.Close()
	return scanMembers(rows)
}

func (s *PostgresNamespaceStore) GetMember(ctx context.Context, namespaceID, userID string) (*domain.Member, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT m.namespace_id, m.user_id,
		       COALESCE(u_email.email, ''), COALESCE(u_name.display_name, ''),
		       m.role_id, COALESCE(r.name, ''), m.created_at
		FROM namespace_members m
		LEFT JOIN LATERAL (
			SELECT om.email FROM organization_members om WHERE om.user_id = m.user_id LIMIT 1
		) u_email ON TRUE
		LEFT JOIN LATERAL (
			SELECT om.display_name FROM organization_members om WHERE om.user_id = m.user_id LIMIT 1
		) u_name ON TRUE
		LEFT JOIN roles r ON r.id = m.role_id
		WHERE m.namespace_id = $1 AND m.user_id = $2`, namespaceID, userID)
	var m domain.Member
	if err := row.Scan(&m.NamespaceID, &m.UserID, &m.Email, &m.DisplayName,
		&m.RoleID, &m.RoleName, &m.CreatedAt); err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *PostgresNamespaceStore) AddMember(ctx context.Context, m *domain.Member) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (namespace_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
		m.NamespaceID, m.UserID, m.RoleID, m.CreatedAt)
	if err != nil {
		return fmt.Errorf("add namespace member: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) UpdateMemberRole(ctx context.Context, namespaceID, userID, roleID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE namespace_members SET role_id = $1
		WHERE namespace_id = $2 AND user_id = $3`, roleID, namespaceID, userID)
	if err != nil {
		return fmt.Errorf("update member role: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) RemoveMember(ctx context.Context, namespaceID, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM namespace_members WHERE namespace_id = $1 AND user_id = $2`,
		namespaceID, userID)
	if err != nil {
		return fmt.Errorf("remove namespace member: %w", err)
	}
	return nil
}

// ── Environment Access Grants ────────────────────────────────────────────────

func (s *PostgresNamespaceStore) GetEnvironmentLimitedAccess(ctx context.Context, environmentID string) (bool, error) {
	var limited bool
	err := s.db.QueryRowContext(ctx, `SELECT limited_access FROM environments WHERE id = $1`, environmentID).Scan(&limited)
	if err != nil {
		return false, fmt.Errorf("get environment limited access: %w", err)
	}
	return limited, nil
}

func (s *PostgresNamespaceStore) SetEnvironmentLimitedAccess(ctx context.Context, environmentID string, limited bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE environments SET limited_access = $1 WHERE id = $2`, limited, environmentID)
	if err != nil {
		return fmt.Errorf("set environment limited access: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) ListEnvironmentGrants(ctx context.Context, environmentID string) ([]*domain.EnvAccessGrant, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT g.environment_id, g.user_id, COALESCE(u_email.email, ''), COALESCE(u_name.display_name, ''),
		       COALESCE(g.granted_by, ''), COALESCE(g.role_id, ''), COALESCE(r.name, ''), g.created_at
		FROM environment_access_grants g
		LEFT JOIN LATERAL (
			SELECT om.email FROM organization_members om WHERE om.user_id = g.user_id LIMIT 1
		) u_email ON TRUE
		LEFT JOIN LATERAL (
			SELECT om.display_name FROM organization_members om WHERE om.user_id = g.user_id LIMIT 1
		) u_name ON TRUE
		LEFT JOIN roles r ON r.id = g.role_id
		WHERE g.environment_id = $1
		ORDER BY g.created_at ASC`, environmentID)
	if err != nil {
		return nil, fmt.Errorf("list environment grants: %w", err)
	}
	defer rows.Close()

	var out []*domain.EnvAccessGrant
	for rows.Next() {
		var g domain.EnvAccessGrant
		if err := rows.Scan(&g.EnvironmentID, &g.UserID, &g.Email, &g.DisplayName, &g.GrantedBy, &g.RoleID, &g.RoleName, &g.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &g)
	}
	return out, rows.Err()
}

func (s *PostgresNamespaceStore) AddEnvironmentGrant(ctx context.Context, environmentID, userID, grantedBy, roleID string) error {
	var grantedByPtr *string
	if grantedBy != "" {
		grantedByPtr = &grantedBy
	}
	var roleIDPtr *string
	if roleID != "" {
		roleIDPtr = &roleID
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO environment_access_grants (environment_id, user_id, granted_by, role_id, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (environment_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
		environmentID, userID, grantedByPtr, roleIDPtr)
	if err != nil {
		return fmt.Errorf("add environment grant: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) RemoveEnvironmentGrant(ctx context.Context, environmentID, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM environment_access_grants WHERE environment_id = $1 AND user_id = $2`, environmentID, userID)
	if err != nil {
		return fmt.Errorf("remove environment grant: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) HasEnvironmentGrant(ctx context.Context, environmentID, userID string) (bool, error) {
	var found bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM environment_access_grants WHERE environment_id = $1 AND user_id = $2)
	`, environmentID, userID).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("has environment grant: %w", err)
	}
	return found, nil
}

// ── Permission overrides ──────────────────────────────────────────────────────

func (s *PostgresNamespaceStore) ListOverrides(ctx context.Context, namespaceID, userID string) ([]*domain.PermissionOverride, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT namespace_id, user_id, permission_key, effect
		FROM member_permission_overrides
		WHERE namespace_id = $1 AND user_id = $2`, namespaceID, userID)
	if err != nil {
		return nil, fmt.Errorf("list overrides: %w", err)
	}
	defer rows.Close()
	var out []*domain.PermissionOverride
	for rows.Next() {
		var o domain.PermissionOverride
		if err := rows.Scan(&o.NamespaceID, &o.UserID, &o.PermissionKey, &o.Effect); err != nil {
			return nil, err
		}
		out = append(out, &o)
	}
	return out, rows.Err()
}

func (s *PostgresNamespaceStore) SetOverride(ctx context.Context, o *domain.PermissionOverride) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO member_permission_overrides (namespace_id, user_id, permission_key, effect)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (namespace_id, user_id, permission_key) DO UPDATE SET effect = EXCLUDED.effect`,
		o.NamespaceID, o.UserID, o.PermissionKey, o.Effect)
	if err != nil {
		return fmt.Errorf("set override: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) DeleteOverride(ctx context.Context, namespaceID, userID, permissionKey string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM member_permission_overrides
		WHERE namespace_id = $1 AND user_id = $2 AND permission_key = $3`,
		namespaceID, userID, permissionKey)
	if err != nil {
		return fmt.Errorf("delete override: %w", err)
	}
	return nil
}

// ── Invites ───────────────────────────────────────────────────────────────────

func (s *PostgresNamespaceStore) ListInvites(ctx context.Context, namespaceID string) ([]*domain.Invite, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.namespace_id, COALESCE(i.role_id, ''), COALESCE(r.name, ''),
		       COALESCE(i.invited_email, ''), i.max_uses, i.use_count,
		       i.invited_by, i.expires_at, i.accepted_at, i.created_at,
		       COALESCE(i.grant_environment_id, '')
		FROM namespace_invites i
		LEFT JOIN roles r ON r.id = i.role_id
		WHERE i.namespace_id = $1
		  AND (i.accepted_at IS NULL)
		  AND i.expires_at > NOW()
		ORDER BY i.created_at DESC`, namespaceID)
	if err != nil {
		return nil, fmt.Errorf("list namespace invites: %w", err)
	}
	defer rows.Close()
	return scanInvites(rows)
}

func (s *PostgresNamespaceStore) CreateInvite(ctx context.Context, inv *domain.Invite) error {
	var maxUses *int
	if inv.MaxUses != nil {
		maxUses = inv.MaxUses
	}
	var invitedEmail *string
	if inv.InvitedEmail != "" {
		invitedEmail = &inv.InvitedEmail
	}
	var roleID *string
	if inv.RoleID != "" {
		roleID = &inv.RoleID
	}
	var grantEnvID *string
	if inv.GrantEnvironmentID != "" {
		grantEnvID = &inv.GrantEnvironmentID
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO namespace_invites
		    (id, namespace_id, role_id, invited_email, max_uses, use_count,
		     token_hash, invited_by, expires_at, created_at, grant_environment_id)
		VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10)`,
		inv.ID, inv.NamespaceID, roleID, invitedEmail, maxUses,
		inv.TokenHash, inv.InvitedBy, inv.ExpiresAt, inv.CreatedAt, grantEnvID)
	if err != nil {
		return fmt.Errorf("create namespace invite: %w", err)
	}
	return nil
}

func (s *PostgresNamespaceStore) FindInviteByToken(ctx context.Context, tokenHash string) (*domain.Invite, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT i.id, i.namespace_id, COALESCE(i.role_id, ''), COALESCE(r.name, ''),
		       COALESCE(i.invited_email, ''), i.max_uses, i.use_count,
		       i.invited_by, i.expires_at, i.accepted_at, i.created_at,
		       COALESCE(i.grant_environment_id, '')
		FROM namespace_invites i
		LEFT JOIN roles r ON r.id = i.role_id
		WHERE i.token_hash = $1`, tokenHash)
	var inv domain.Invite
	var maxUses sql.NullInt64
	var acceptedAt sql.NullTime
	if err := row.Scan(
		&inv.ID, &inv.NamespaceID, &inv.RoleID, &inv.RoleName,
		&inv.InvitedEmail, &maxUses, &inv.UseCount,
		&inv.InvitedBy, &inv.ExpiresAt, &acceptedAt, &inv.CreatedAt, &inv.GrantEnvironmentID,
	); err != nil {
		return nil, err
	}
	if maxUses.Valid {
		n := int(maxUses.Int64)
		inv.MaxUses = &n
	}
	if acceptedAt.Valid {
		inv.AcceptedAt = &acceptedAt.Time
	}
	return &inv, nil
}

func (s *PostgresNamespaceStore) RevokeInvite(ctx context.Context, inviteID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM namespace_invites WHERE id = $1`, inviteID)
	if err != nil {
		return fmt.Errorf("revoke namespace invite: %w", err)
	}
	return nil
}

// AcceptInvite marks the invite accepted and adds the user as a member (email invites).
func (s *PostgresNamespaceStore) AcceptInvite(ctx context.Context, inviteID, userID, email, displayName string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var inv struct {
		NamespaceID        string
		NamespaceType      string
		RoleID             sql.NullString
		GrantEnvironmentID sql.NullString
	}
	err = tx.QueryRowContext(ctx, `
		SELECT i.namespace_id, n.type, i.role_id, i.grant_environment_id
		FROM namespace_invites i
		JOIN namespaces n ON n.id = i.namespace_id
		WHERE i.id = $1 AND i.accepted_at IS NULL AND i.expires_at > NOW()`, inviteID).
		Scan(&inv.NamespaceID, &inv.NamespaceType, &inv.RoleID, &inv.GrantEnvironmentID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("invite not found or already used")
	}
	if err != nil {
		return fmt.Errorf("find invite: %w", err)
	}

	now := time.Now().UTC()
	if _, err := tx.ExecContext(ctx,
		`UPDATE namespace_invites SET accepted_at = $1 WHERE id = $2`, now, inviteID); err != nil {
		return fmt.Errorf("mark invite accepted: %w", err)
	}

	isEnvScopedInvite := inv.GrantEnvironmentID.Valid && inv.GrantEnvironmentID.String != ""
	// Hobby NS project-specific invites: env grant only, no NS membership.
	hobbyProjectInvite := isEnvScopedInvite && inv.NamespaceType == "user"

	if !hobbyProjectInvite {
		roleID := inv.RoleID.String
		if !inv.RoleID.Valid || roleID == "" {
			if err := tx.QueryRowContext(ctx,
				`SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Member' AND is_system = TRUE`,
				inv.NamespaceID).Scan(&roleID); err != nil {
				return fmt.Errorf("find default member role: %w", err)
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (namespace_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
			inv.NamespaceID, userID, roleID, now); err != nil {
			return fmt.Errorf("add member from invite: %w", err)
		}
	}

	if isEnvScopedInvite {
		var memberRoleID string
		if err := tx.QueryRowContext(ctx,
			`SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Member' AND is_system = TRUE`,
			inv.NamespaceID).Scan(&memberRoleID); err != nil {
			return fmt.Errorf("find member role for env grant: %w", err)
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE environments SET limited_access = TRUE WHERE id = $1`,
			inv.GrantEnvironmentID.String); err != nil {
			return fmt.Errorf("enable limited_access on grant env: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO environment_access_grants (environment_id, user_id, granted_by, role_id, created_at)
			VALUES ($1, $2, NULL, $3, $4)
			ON CONFLICT (environment_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
			inv.GrantEnvironmentID.String, userID, memberRoleID, now); err != nil {
			return fmt.Errorf("add environment grant from invite: %w", err)
		}
	}

	return tx.Commit()
}

// IncrementInviteUseCount records a shareable link usage and adds the user as a member.
func (s *PostgresNamespaceStore) IncrementInviteUseCount(ctx context.Context, inviteID, userID, email, displayName string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var inv struct {
		NamespaceID        string
		NamespaceType      string
		RoleID             sql.NullString
		UseCount           int
		MaxUses            sql.NullInt64
		GrantEnvironmentID sql.NullString
	}
	err = tx.QueryRowContext(ctx, `
		SELECT i.namespace_id, n.type, i.role_id, i.use_count, i.max_uses, i.grant_environment_id
		FROM namespace_invites i
		JOIN namespaces n ON n.id = i.namespace_id
		WHERE i.id = $1 AND i.expires_at > NOW()`, inviteID).
		Scan(&inv.NamespaceID, &inv.NamespaceType, &inv.RoleID, &inv.UseCount, &inv.MaxUses, &inv.GrantEnvironmentID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("invite not found or expired")
	}
	if err != nil {
		return fmt.Errorf("find invite: %w", err)
	}
	if inv.MaxUses.Valid && inv.UseCount >= int(inv.MaxUses.Int64) {
		return fmt.Errorf("invite use limit reached")
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE namespace_invites SET use_count = use_count + 1 WHERE id = $1`, inviteID); err != nil {
		return fmt.Errorf("increment use count: %w", err)
	}

	now := time.Now().UTC()
	isEnvScopedInvite := inv.GrantEnvironmentID.Valid && inv.GrantEnvironmentID.String != ""
	hobbyProjectInvite := isEnvScopedInvite && inv.NamespaceType == "user"

	if !hobbyProjectInvite {
		roleID := inv.RoleID.String
		if !inv.RoleID.Valid || roleID == "" {
			if err := tx.QueryRowContext(ctx,
				`SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Member' AND is_system = TRUE`,
				inv.NamespaceID).Scan(&roleID); err != nil {
				return fmt.Errorf("find default member role: %w", err)
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (namespace_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
			inv.NamespaceID, userID, roleID, now); err != nil {
			return fmt.Errorf("add member from shareable invite: %w", err)
		}
	}

	if isEnvScopedInvite {
		var memberRoleID string
		if err := tx.QueryRowContext(ctx,
			`SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Member' AND is_system = TRUE`,
			inv.NamespaceID).Scan(&memberRoleID); err != nil {
			return fmt.Errorf("find member role for env grant: %w", err)
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE environments SET limited_access = TRUE WHERE id = $1`,
			inv.GrantEnvironmentID.String); err != nil {
			return fmt.Errorf("enable limited_access on grant env: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO environment_access_grants (environment_id, user_id, granted_by, role_id, created_at)
			VALUES ($1, $2, NULL, $3, $4)
			ON CONFLICT (environment_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
			inv.GrantEnvironmentID.String, userID, memberRoleID, now); err != nil {
			return fmt.Errorf("add environment grant from shareable invite: %w", err)
		}
	}

	return tx.Commit()
}

// HasPermission resolves whether userID has permissionKey within namespaceID.
// Resolution order: NS-level overrides → env limited_access gate + env-scoped role → NS role.
func (s *PostgresNamespaceStore) HasPermission(ctx context.Context, namespaceID, userID, permissionKey, environmentID string) (bool, error) {
	// NS-level overrides always take precedence.
	var effect sql.NullString
	_ = s.db.QueryRowContext(ctx, `
		SELECT effect FROM member_permission_overrides
		WHERE namespace_id = $1 AND user_id = $2 AND permission_key = $3`,
		namespaceID, userID, permissionKey).Scan(&effect)
	if effect.Valid {
		return effect.String == "allow", nil
	}

	// Environment-scoped checks: limited_access gate + optional env role override.
	if environmentID != "" {
		var limited bool
		var grantExists bool
		var envRoleID sql.NullString
		err := s.db.QueryRowContext(ctx, `
			SELECT e.limited_access,
			       (g.user_id IS NOT NULL),
			       g.role_id
			FROM environments e
			LEFT JOIN environment_access_grants g
			    ON g.environment_id = e.id AND g.user_id = $2
			WHERE e.id = $1`, environmentID, userID).
			Scan(&limited, &grantExists, &envRoleID)
		if err != nil && err != sql.ErrNoRows {
			return false, fmt.Errorf("env access check: %w", err)
		}

		if limited && !grantExists {
			// NS Owners and Admins bypass the limited_access gate.
			var isOwnerOrAdmin bool
			_ = s.db.QueryRowContext(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM namespace_members m
					JOIN roles r ON r.id = m.role_id
					WHERE m.namespace_id = $1 AND m.user_id = $2
					AND r.name IN ('Owner', 'Admin')
				)`, namespaceID, userID).Scan(&isOwnerOrAdmin)
			if !isOwnerOrAdmin {
				return false, nil
			}
		}

		// Env-scoped role overrides the NS role for this environment.
		if grantExists && envRoleID.Valid && envRoleID.String != "" {
			var found bool
			if err := s.db.QueryRowContext(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM role_permissions
					WHERE role_id = $1 AND permission_key = $2
				)`, envRoleID.String, permissionKey).Scan(&found); err != nil {
				return false, fmt.Errorf("env role check: %w", err)
			}
			return found, nil
		}

		// User has a grant but no specific env role — fall back to the NS "Member" role.
		// This covers env-only users (hobby invites) who have no namespace_members row.
		if grantExists {
			var found bool
			if err := s.db.QueryRowContext(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM role_permissions rp
					JOIN roles r ON r.id = rp.role_id
					WHERE r.namespace_id = $1 AND r.name = 'Member' AND rp.permission_key = $2
				)`, namespaceID, permissionKey).Scan(&found); err == nil && found {
				return true, nil
			}
		}
	}

	// Fall back to NS role.
	var found bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM namespace_members m
			JOIN role_permissions rp ON rp.role_id = m.role_id
			WHERE m.namespace_id = $1 AND m.user_id = $2 AND rp.permission_key = $3
		)`, namespaceID, userID, permissionKey).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("has permission: %w", err)
	}
	return found, nil
}

func (s *PostgresNamespaceStore) ListEffectivePermissions(ctx context.Context, namespaceID, userID, environmentID string) ([]string, error) {
	// Determine the effective role: env-scoped role (if set) otherwise NS role.
	// Also enforce the limited_access gate.
	roleSource := "ns" // "ns" | "env"
	var envRoleID string

	if environmentID != "" {
		var limited bool
		var grantExists bool
		var envRole sql.NullString
		err := s.db.QueryRowContext(ctx, `
			SELECT e.limited_access,
			       (g.user_id IS NOT NULL),
			       g.role_id
			FROM environments e
			LEFT JOIN environment_access_grants g
			    ON g.environment_id = e.id AND g.user_id = $2
			WHERE e.id = $1`, environmentID, userID).
			Scan(&limited, &grantExists, &envRole)
		if err != nil && err != sql.ErrNoRows {
			return nil, fmt.Errorf("env access check: %w", err)
		}

		if limited && !grantExists {
			var isOwnerOrAdmin bool
			_ = s.db.QueryRowContext(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM namespace_members m
					JOIN roles r ON r.id = m.role_id
					WHERE m.namespace_id = $1 AND m.user_id = $2
					AND r.name IN ('Owner', 'Admin')
				)`, namespaceID, userID).Scan(&isOwnerOrAdmin)
			if !isOwnerOrAdmin {
				return []string{}, nil
			}
		}

		if grantExists && envRole.Valid && envRole.String != "" {
			roleSource = "env"
			envRoleID = envRole.String
		} else if grantExists {
			// Env-only user (hobby invite): use the NS "Member" role as baseline.
			_ = s.db.QueryRowContext(ctx, `
				SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Member' LIMIT 1`,
				namespaceID).Scan(&envRoleID)
			if envRoleID != "" {
				roleSource = "env"
			}
		}
	}

	var (
		rows *sql.Rows
		err  error
	)
	if roleSource == "env" {
		// Permissions from the env-scoped role, still subject to NS overrides.
		rows, err = s.db.QueryContext(ctx, `
			(
				SELECT rp.permission_key
				FROM role_permissions rp
				WHERE rp.role_id = $3
				UNION
				SELECT permission_key
				FROM member_permission_overrides
				WHERE namespace_id = $1 AND user_id = $2 AND effect = 'allow'
			)
			EXCEPT
			SELECT permission_key
			FROM member_permission_overrides
			WHERE namespace_id = $1 AND user_id = $2 AND effect = 'deny'`,
			namespaceID, userID, envRoleID)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			(
				SELECT rp.permission_key
				FROM namespace_members m
				JOIN role_permissions rp ON rp.role_id = m.role_id
				WHERE m.namespace_id = $1 AND m.user_id = $2
				UNION
				SELECT permission_key
				FROM member_permission_overrides
				WHERE namespace_id = $1 AND user_id = $2 AND effect = 'allow'
			)
			EXCEPT
			SELECT permission_key
			FROM member_permission_overrides
			WHERE namespace_id = $1 AND user_id = $2 AND effect = 'deny'`,
			namespaceID, userID)
	}
	if err != nil {
		return nil, fmt.Errorf("list effective permissions: %w", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	if out == nil {
		out = []string{}
	}
	return out, rows.Err()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// HashToken returns the SHA-256 hex of a raw token for safe DB storage.
func HashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// EnsureNamespaceWithOwner bootstraps a namespace + owner membership in one transaction.
func (s *PostgresNamespaceStore) EnsureNamespaceWithOwner(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// Namespace row must already exist (created when users row was backfilled).
	var roleID string
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Owner' AND is_system = TRUE`,
		userID).Scan(&roleID)
	if err != nil {
		return fmt.Errorf("find owner role: %w", err)
	}

	now := time.Now().UTC()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (namespace_id, user_id) DO NOTHING`,
		userID, userID, roleID, now); err != nil {
		return fmt.Errorf("ensure namespace owner membership: %w", err)
	}
	return tx.Commit()
}

// NewOrgNamespace creates a fresh org namespace, seeds its system roles, and
// makes the caller its owner — all in one transaction.
func (s *PostgresNamespaceStore) NewOrgNamespace(ctx context.Context, ns *domain.Namespace, ownerUserID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO namespaces (id, type, slug, name, description, avatar_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		ns.ID, ns.Type, ns.Slug, ns.Name, ns.Description, ns.AvatarURL, ns.CreatedAt, ns.UpdatedAt); err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return ErrSlugTaken
		}
		return fmt.Errorf("insert namespace: %w", err)
	}

	ownerRoleID := "role-owner-" + ns.ID
	memberRoleID := "role-member-" + ns.ID

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO roles (id, namespace_id, name, description, is_system, created_at, updated_at)
		VALUES ($1, $2, 'Owner', 'Full access to all namespace resources', TRUE, $3, $3),
		       ($4, $2, 'Member', 'Read access to namespace resources', TRUE, $3, $3)`,
		ownerRoleID, ns.ID, ns.CreatedAt, memberRoleID); err != nil {
		return fmt.Errorf("insert system roles: %w", err)
	}

	// Grant all permissions to Owner role.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO role_permissions (role_id, permission_key)
		SELECT $1, key FROM permissions
		ON CONFLICT DO NOTHING`, ownerRoleID); err != nil {
		return fmt.Errorf("grant owner permissions: %w", err)
	}

	// Grant read permissions to Member role.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO role_permissions (role_id, permission_key)
		SELECT $1, key FROM permissions
		WHERE key IN ('namespace:view','member:view','environment:view','workload:view','deployment:view','log:view')
		ON CONFLICT DO NOTHING`, memberRoleID); err != nil {
		return fmt.Errorf("grant member permissions: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (namespace_id, user_id) DO NOTHING`,
		ns.ID, ownerUserID, ownerRoleID, ns.CreatedAt); err != nil {
		return fmt.Errorf("insert owner member: %w", err)
	}

	return tx.Commit()
}

// EnsurePersonalNamespace creates a user-type namespace for userID (using the
// given slug and display name) if one does not already exist. Safe to call on
// every login — returns nil immediately if the namespace is already present.
func (s *PostgresNamespaceStore) EnsurePersonalNamespace(ctx context.Context, userID, slug, name string) error {
	// Check whether this user already owns a user-type namespace.
	var existing string
	err := s.db.QueryRowContext(ctx, `
		SELECT n.id FROM namespaces n
		JOIN namespace_members m ON m.namespace_id = n.id
		WHERE n.type = 'user' AND m.user_id = $1
		LIMIT 1`, userID).Scan(&existing)
	if err == nil {
		return nil // already provisioned
	}
	if err != sql.ErrNoRows {
		return fmt.Errorf("ensure personal namespace: check: %w", err)
	}

	now := time.Now().UTC()
	ns := &domain.Namespace{
		ID:        userID, // use userID as namespace ID for easy lookup
		Type:      "user",
		Slug:      slug,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("ensure personal namespace: begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO namespaces (id, type, slug, name, description, avatar_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT DO NOTHING`,
		ns.ID, ns.Type, ns.Slug, ns.Name, "", "", ns.CreatedAt, ns.UpdatedAt); err != nil {
		return fmt.Errorf("ensure personal namespace: insert: %w", err)
	}

	ownerRoleID := "role-owner-" + ns.ID
	memberRoleID := "role-member-" + ns.ID

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO roles (id, namespace_id, name, description, is_system, created_at, updated_at)
		VALUES ($1, $2, 'Owner', 'Full access to all namespace resources', TRUE, $3, $3),
		       ($4, $2, 'Member', 'Read access to namespace resources', TRUE, $3, $3)
		ON CONFLICT DO NOTHING`,
		ownerRoleID, ns.ID, now, memberRoleID); err != nil {
		return fmt.Errorf("ensure personal namespace: insert roles: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO role_permissions (role_id, permission_key)
		SELECT $1, key FROM permissions
		ON CONFLICT DO NOTHING`, ownerRoleID); err != nil {
		return fmt.Errorf("ensure personal namespace: grant owner permissions: %w", err)
	}

	// Grant read permissions to Member role.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO role_permissions (role_id, permission_key)
		SELECT $1, key FROM permissions
		WHERE key IN ('namespace:view','member:view','environment:view','workload:view','deployment:view','log:view')
		ON CONFLICT DO NOTHING`, memberRoleID); err != nil {
		return fmt.Errorf("ensure personal namespace: grant member permissions: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (namespace_id, user_id) DO NOTHING`,
		ns.ID, userID, ownerRoleID, now); err != nil {
		return fmt.Errorf("ensure personal namespace: insert owner member: %w", err)
	}

	return tx.Commit()
}

// FindUserIDByEmail returns the platform user ID for the given email by consulting
// the organization_members table (which stores email at invite/join time).
// Returns sql.ErrNoRows when no match is found.
func (s *PostgresNamespaceStore) FindUserIDByEmail(ctx context.Context, email string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx, `
		SELECT u.id FROM users u
		JOIN organization_members om ON om.user_id = u.id
		WHERE LOWER(om.email) = LOWER($1)
		LIMIT 1`, email).Scan(&userID)
	if err != nil {
		return "", err
	}
	return userID, nil
}

// GenerateSlug derives a URL-safe slug from a name + random suffix.
func GenerateSlug(name string) string {
	return ids.New()[:8] // placeholder; handler should slugify the name properly
}



// ── Scanners ──────────────────────────────────────────────────────────────────

func scanNamespace(row *sql.Row) (*domain.Namespace, error) {
	var n domain.Namespace
	if err := row.Scan(&n.ID, &n.Type, &n.Slug, &n.Name, &n.Description,
		&n.AvatarURL, &n.CreatedAt, &n.UpdatedAt); err != nil {
		return nil, err
	}
	return &n, nil
}

func scanNamespaces(rows *sql.Rows) ([]*domain.Namespace, error) {
	var out []*domain.Namespace
	for rows.Next() {
		var n domain.Namespace
		if err := rows.Scan(&n.ID, &n.Type, &n.Slug, &n.Name, &n.Description,
			&n.AvatarURL, &n.CreatedAt, &n.UpdatedAt, &n.UserRole); err != nil {
			return nil, err
		}
		out = append(out, &n)
	}
	return out, rows.Err()
}

func scanRoles(rows *sql.Rows) ([]*domain.Role, error) {
	var out []*domain.Role
	for rows.Next() {
		var r domain.Role
		if err := rows.Scan(&r.ID, &r.NamespaceID, &r.Name, &r.Description,
			&r.IsSystem, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, &r)
	}
	return out, rows.Err()
}

func scanMembers(rows *sql.Rows) ([]*domain.Member, error) {
	var out []*domain.Member
	for rows.Next() {
		var m domain.Member
		if err := rows.Scan(&m.NamespaceID, &m.UserID, &m.Email, &m.DisplayName,
			&m.RoleID, &m.RoleName, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &m)
	}
	return out, rows.Err()
}

func scanInvites(rows *sql.Rows) ([]*domain.Invite, error) {
	var out []*domain.Invite
	for rows.Next() {
		var inv domain.Invite
		var maxUses sql.NullInt64
		var acceptedAt sql.NullTime
		var grantEnv sql.NullString
		if err := rows.Scan(
			&inv.ID, &inv.NamespaceID, &inv.RoleID, &inv.RoleName,
			&inv.InvitedEmail, &maxUses, &inv.UseCount,
			&inv.InvitedBy, &inv.ExpiresAt, &acceptedAt, &inv.CreatedAt, &grantEnv,
		); err != nil {
			return nil, err
		}
		if grantEnv.Valid {
			inv.GrantEnvironmentID = grantEnv.String
		}
		if maxUses.Valid {
			n := int(maxUses.Int64)
			inv.MaxUses = &n
		}
		if acceptedAt.Valid {
			inv.AcceptedAt = &acceptedAt.Time
		}
		out = append(out, &inv)
	}
	return out, rows.Err()
}

// ensure pq is used (for array scanning in future queries)
var _ = pq.Array

func (s *PostgresNamespaceStore) EnsurePersonalMemberPermissions(ctx context.Context, namespaceID string) error {
	var roleID string
	err := s.db.QueryRowContext(ctx, "SELECT id FROM roles WHERE namespace_id = $1 AND name = 'Member' AND is_system = TRUE", namespaceID).Scan(&roleID)
	if err != nil { return err }
	_, err = s.db.ExecContext(ctx, "INSERT INTO role_permissions (role_id, permission_key) SELECT $1, key FROM permissions WHERE key IN ('namespace:view','member:view','environment:view','workload:view','deployment:view','log:view') ON CONFLICT DO NOTHING", roleID)
	return err
}

func (s *PostgresNamespaceStore) IsNamespaceMember(ctx context.Context, namespaceID, userID string) (bool, error) {
	var found bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM namespace_members
			WHERE namespace_id = $1 AND user_id = $2
		)`, namespaceID, userID).Scan(&found)
	return found, err
}

func (s *PostgresNamespaceStore) ListSharedProjects(ctx context.Context, userID string) ([]*domain.SharedProject, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT n.slug, n.name, e.id, e.slug, e.name
		FROM environment_access_grants g
		JOIN environments e ON e.id = g.environment_id
		JOIN namespaces n ON n.id = e.namespace_id
		WHERE g.user_id = $1
		  AND NOT EXISTS (
		      SELECT 1 FROM namespace_members m
		      WHERE m.namespace_id = n.id AND m.user_id = $1
		  )
		ORDER BY n.name, e.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.SharedProject
	for rows.Next() {
		p := &domain.SharedProject{}
		if err := rows.Scan(&p.NamespaceSlug, &p.NamespaceName, &p.EnvID, &p.EnvSlug, &p.EnvName); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SearchUsers finds platform users whose slug, display_name, or email contains query (case-insensitive).
func (s *PostgresNamespaceStore) SearchUsers(ctx context.Context, query, excludeUserID string) ([]*domain.UserSearchResult, error) {
	like := "%" + query + "%"
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.slug,
		       COALESCE(MAX(om.display_name) FILTER (WHERE om.display_name != ''), u.slug) AS display_name,
		       COALESCE(MAX(om.email) FILTER (WHERE om.email != ''), '') AS email
		FROM users u
		LEFT JOIN organization_members om ON om.user_id = u.id
		WHERE u.id != $1
		  AND (
		      u.slug ILIKE $2
		   OR om.display_name ILIKE $2
		   OR om.email ILIKE $2
		  )
		GROUP BY u.id, u.slug
		LIMIT 10`, excludeUserID, like)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	var out []*domain.UserSearchResult
	for rows.Next() {
		r := &domain.UserSearchResult{}
		if err := rows.Scan(&r.UserID, &r.Slug, &r.DisplayName, &r.Email); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
