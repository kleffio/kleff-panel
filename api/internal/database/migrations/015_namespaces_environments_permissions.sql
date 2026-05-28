-- 015_namespaces_environments_permissions.sql
-- Introduces unified namespaces (users + orgs), environments (replacing projects),
-- and a flexible atomic permission / role system.
-- Old tables (organizations, projects, org_invites) are preserved for backward
-- compatibility and will be cleaned up in a later migration.

-- ── 1. Namespaces ─────────────────────────────────────────────────────────────
-- A namespace is either a user-owned or an org-owned identity.
-- User namespaces: id == users.id.
-- Org namespaces:  id == organizations.id (for existing) or a new hex id.

CREATE TABLE IF NOT EXISTS namespaces (
    id          TEXT        PRIMARY KEY,
    type        TEXT        NOT NULL CHECK (type IN ('user', 'org')),
    slug        TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    avatar_url  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_namespaces_slug ON namespaces(slug);
CREATE INDEX        IF NOT EXISTS idx_namespaces_type ON namespaces(type);

-- ── 2. Backfill namespaces from organizations ─────────────────────────────────

INSERT INTO namespaces (id, type, slug, name, created_at, updated_at)
SELECT
    o.id,
    'org',
    COALESCE(NULLIF(TRIM(o.slug), ''), 'org-' || SUBSTRING(o.id, 1, 8)),
    o.name,
    o.created_at,
    o.updated_at
FROM organizations o
ON CONFLICT (id) DO NOTHING;

-- Resolve any duplicate slugs produced by the fallback formula.
WITH dups AS (
    SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
    FROM namespaces
    WHERE type = 'org'
)
UPDATE namespaces n
SET slug = d.slug || '-' || SUBSTRING(n.id, 1, 6)
FROM dups d
WHERE n.id = d.id AND d.rn > 1;

-- ── 3. Backfill namespaces from users ─────────────────────────────────────────

INSERT INTO namespaces (id, type, slug, name, created_at, updated_at)
SELECT
    u.id,
    'user',
    u.slug,
    COALESCE(
        (SELECT NULLIF(TRIM(p.username), '') FROM user_profiles p WHERE p.user_id = u.id),
        u.slug
    ),
    u.created_at,
    u.created_at
FROM users u
ON CONFLICT (id) DO NOTHING;

-- Resolve any slug collision between a user namespace and an org namespace.
-- This should be rare but guard against it.
UPDATE namespaces n
SET slug = n.slug || '-u'
WHERE n.type = 'user'
  AND EXISTS (
      SELECT 1 FROM namespaces n2
      WHERE n2.slug = n.slug AND n2.id <> n.id
  );

-- ── 4. Environments ───────────────────────────────────────────────────────────
-- Environments replace projects. namespace_id is the owning namespace.

CREATE TABLE IF NOT EXISTS environments (
    id           TEXT        PRIMARY KEY,
    namespace_id TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    slug         TEXT        NOT NULL,
    name         TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    is_private   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (namespace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_environments_namespace_id ON environments(namespace_id);

-- Backfill environments from projects.
-- projects.organization_id → environments.namespace_id (orgs were already migrated above).
INSERT INTO environments (id, namespace_id, slug, name, created_at, updated_at)
SELECT
    p.id,
    p.organization_id,
    p.slug,
    p.name,
    p.created_at,
    p.updated_at
FROM projects p
WHERE EXISTS (SELECT 1 FROM namespaces n WHERE n.id = p.organization_id)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Permissions ────────────────────────────────────────────────────────────
-- Atomic, named permission keys. Plugins may add their own rows at install time.

CREATE TABLE IF NOT EXISTS permissions (
    key         TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'system'  -- 'system' or 'plugin:<plugin_id>'
);

INSERT INTO permissions (key, description) VALUES
    ('namespace:view',       'View namespace profile and public info'),
    ('namespace:manage',     'Edit namespace settings'),
    ('member:view',          'View the member list'),
    ('member:invite',        'Invite new members'),
    ('member:remove',        'Remove members'),
    ('member:manage_roles',  'Assign or change member roles'),
    ('environment:create',   'Create new environments'),
    ('environment:view',     'View an environment and its workloads'),
    ('environment:manage',   'Edit environment settings'),
    ('environment:delete',   'Delete an environment'),
    ('workload:create',      'Create workloads'),
    ('workload:view',        'View workloads'),
    ('workload:manage',      'Restart, reconfigure, and act on workloads'),
    ('workload:delete',      'Delete workloads'),
    ('deployment:view',      'View deployment history'),
    ('deployment:create',    'Trigger deployments'),
    ('log:view',             'View workload logs'),
    ('apikey:create',        'Create API keys'),
    ('apikey:view',          'View API keys'),
    ('apikey:revoke',        'Revoke API keys'),
    ('billing:view',         'View billing information'),
    ('billing:manage',       'Edit billing settings')
ON CONFLICT (key) DO NOTHING;

-- ── 6. Roles ──────────────────────────────────────────────────────────────────
-- A role is a named group of permissions scoped to a namespace.
-- System roles (is_system = TRUE) cannot be deleted by namespace admins.

CREATE TABLE IF NOT EXISTS roles (
    id           TEXT        PRIMARY KEY,
    namespace_id TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    is_system    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (namespace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_namespace_id ON roles(namespace_id);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id        TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_key)
);

-- ── 7. Seed system roles per namespace ───────────────────────────────────────

-- Owner role (full access)
INSERT INTO roles (id, namespace_id, name, description, is_system, created_at, updated_at)
SELECT
    'role-owner-' || n.id,
    n.id,
    'Owner',
    'Full access to all namespace resources',
    TRUE,
    n.created_at,
    n.created_at
FROM namespaces n
ON CONFLICT (namespace_id, name) DO NOTHING;

-- Member role (read-only by default)
INSERT INTO roles (id, namespace_id, name, description, is_system, created_at, updated_at)
SELECT
    'role-member-' || n.id,
    n.id,
    'Member',
    'Read access to namespace resources',
    TRUE,
    n.created_at,
    n.created_at
FROM namespaces n
ON CONFLICT (namespace_id, name) DO NOTHING;

-- Grant all permissions to Owner roles.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner' AND r.is_system = TRUE
ON CONFLICT DO NOTHING;

-- Grant read permissions to Member roles.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Member' AND r.is_system = TRUE
  AND p.key IN (
      'namespace:view', 'member:view',
      'environment:view', 'workload:view',
      'deployment:view', 'log:view'
  )
ON CONFLICT DO NOTHING;

-- ── 8. Namespace members ──────────────────────────────────────────────────────
-- Each user has exactly one role per namespace; per-user overrides are separate.

CREATE TABLE IF NOT EXISTS namespace_members (
    namespace_id TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    user_id      TEXT        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    role_id      TEXT        NOT NULL REFERENCES roles(id)      ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_namespace_members_user_id ON namespace_members(user_id);

-- Backfill from organization_members → namespace_members.
-- admin role in old system → Owner role (closest equivalent).
INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
SELECT
    om.org_id,
    om.user_id,
    CASE
        WHEN om.role IN ('owner', 'admin') THEN 'role-owner-' || om.org_id
        ELSE 'role-member-' || om.org_id
    END,
    om.created_at
FROM organization_members om
WHERE EXISTS (SELECT 1 FROM namespaces  n WHERE n.id = om.org_id)
  AND EXISTS (SELECT 1 FROM users       u WHERE u.id = om.user_id)
ON CONFLICT (namespace_id, user_id) DO NOTHING;

-- Every user is the owner of their own user namespace.
INSERT INTO namespace_members (namespace_id, user_id, role_id, created_at)
SELECT
    n.id,
    n.id,
    'role-owner-' || n.id,
    n.created_at
FROM namespaces n
WHERE n.type = 'user'
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = n.id)
ON CONFLICT (namespace_id, user_id) DO NOTHING;

-- ── 9. Per-member permission overrides ───────────────────────────────────────
-- Allow or deny individual permissions on top of the member's role.

CREATE TABLE IF NOT EXISTS member_permission_overrides (
    namespace_id   TEXT NOT NULL REFERENCES namespaces(id)  ON DELETE CASCADE,
    user_id        TEXT NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    effect         TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
    PRIMARY KEY (namespace_id, user_id, permission_key)
);

-- ── 10. Namespace invites ─────────────────────────────────────────────────────
-- Supports both email invites (invited_email set) and shareable links (max_uses set).

CREATE TABLE IF NOT EXISTS namespace_invites (
    id            TEXT        PRIMARY KEY,
    namespace_id  TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    role_id       TEXT        REFERENCES roles(id) ON DELETE SET NULL,
    invited_email TEXT,                         -- NULL for shareable links
    max_uses      INTEGER,                      -- NULL = unlimited (shareable links)
    use_count     INTEGER     NOT NULL DEFAULT 0,
    token_hash    TEXT        NOT NULL UNIQUE,
    invited_by    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at    TIMESTAMPTZ NOT NULL,
    accepted_at   TIMESTAMPTZ,                  -- set only for single-use email invites
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_namespace_invites_namespace_id ON namespace_invites(namespace_id);
CREATE INDEX IF NOT EXISTS idx_namespace_invites_token_hash   ON namespace_invites(token_hash);

-- ── 11. Environment-specific permissions ─────────────────────────────────────
-- Custom permissions registered for a specific environment (e.g. by a plugin).

CREATE TABLE IF NOT EXISTS environment_permissions (
    environment_id TEXT NOT NULL REFERENCES environments(id)  ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key)  ON DELETE CASCADE,
    PRIMARY KEY (environment_id, permission_key)
);

-- ── 12. API keys ──────────────────────────────────────────────────────────────
-- Scoped to a namespace; optionally restricted to a subset of the owner's permissions.

CREATE TABLE IF NOT EXISTS api_keys (
    id                 TEXT        PRIMARY KEY,
    namespace_id       TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    user_id            TEXT        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    name               TEXT        NOT NULL,
    key_hash           TEXT        NOT NULL UNIQUE,
    key_prefix         TEXT        NOT NULL,       -- first 8 chars shown in UI
    scoped_permissions TEXT[],                     -- NULL = inherit all user permissions
    expires_at         TIMESTAMPTZ,                -- NULL = never expires
    last_used_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_namespace_id ON api_keys(namespace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id      ON api_keys(user_id);

-- ── 13. Add environment_id to workloads ──────────────────────────────────────

ALTER TABLE workloads ADD COLUMN IF NOT EXISTS environment_id TEXT
    REFERENCES environments(id) ON DELETE CASCADE;

UPDATE workloads SET environment_id = project_id
WHERE environment_id IS NULL
  AND EXISTS (SELECT 1 FROM environments e WHERE e.id = project_id);

CREATE INDEX IF NOT EXISTS idx_workloads_environment_id ON workloads(environment_id);

-- ── 14. Add environment_id to deployments ────────────────────────────────────

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS environment_id TEXT
    REFERENCES environments(id) ON DELETE CASCADE;

UPDATE deployments SET environment_id = project_id
WHERE environment_id IS NULL
  AND EXISTS (SELECT 1 FROM environments e WHERE e.id = project_id);

-- ── 15. Add environment_id to workload_log_lines ─────────────────────────────

ALTER TABLE workload_log_lines ADD COLUMN IF NOT EXISTS environment_id TEXT;

UPDATE workload_log_lines SET environment_id = project_id
WHERE environment_id IS NULL
  AND EXISTS (SELECT 1 FROM environments e WHERE e.id = project_id);

CREATE INDEX IF NOT EXISTS idx_wll_environment_id ON workload_log_lines(environment_id);

-- ── 16. Add namespace_id to usage_records ────────────────────────────────────
-- usage_records uses organization_id; add namespace_id as the forward-looking alias.

ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS namespace_id TEXT
    REFERENCES namespaces(id) ON DELETE CASCADE;

UPDATE usage_records SET namespace_id = organization_id
WHERE namespace_id IS NULL
  AND EXISTS (SELECT 1 FROM namespaces n WHERE n.id = organization_id);

CREATE INDEX IF NOT EXISTS idx_usage_records_namespace_id ON usage_records(namespace_id);
