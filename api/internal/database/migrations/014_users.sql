-- Platform identity: one stable row per (idp_issuer, idp_subject) pair.
-- Replaces using raw JWT subjects as durable user identity.

-- 1. Create the platform users table.
CREATE TABLE IF NOT EXISTS users (
    id                TEXT        PRIMARY KEY,
    idp_issuer        TEXT        NOT NULL DEFAULT '',
    idp_subject       TEXT        NOT NULL,
    slug              TEXT        NOT NULL UNIQUE,
    is_platform_admin BOOLEAN     NOT NULL DEFAULT FALSE,
    personal_org_id   TEXT        REFERENCES organizations(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_identity UNIQUE (idp_issuer, idp_subject)
);

CREATE INDEX IF NOT EXISTS idx_users_issuer_subject ON users(idp_issuer, idp_subject);

-- 2. Add slug to organizations if not already present.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug) WHERE slug IS NOT NULL;

-- 3. Backfill users from user_profiles.
-- user_profiles.id becomes users.id so any downstream join continues to work.
-- Slug: 'u-' + sanitized JWT subject (UUIDs produce globally-unique slugs).
INSERT INTO users (id, idp_issuer, idp_subject, slug, created_at)
SELECT
    p.id,
    '',
    p.user_id,
    'u-' || LOWER(REGEXP_REPLACE(SUBSTRING(p.user_id, 1, 40), '[^a-z0-9]', '-', 'g')),
    p.created_at
FROM user_profiles p
ON CONFLICT (idp_issuer, idp_subject) DO NOTHING;

-- 4. Backfill users from organization_members rows not already in user_profiles.
INSERT INTO users (id, idp_issuer, idp_subject, slug, created_at)
SELECT
    md5('legacy-user:' || m.user_id),
    '',
    m.user_id,
    'u-' || LOWER(REGEXP_REPLACE(SUBSTRING(m.user_id, 1, 40), '[^a-z0-9]', '-', 'g')),
    MIN(m.created_at)
FROM organization_members m
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.idp_issuer = '' AND u.idp_subject = m.user_id
)
GROUP BY m.user_id
ON CONFLICT (idp_issuer, idp_subject) DO NOTHING;

-- 5. Backfill personal_org_id: match the old 'org-<slug>' derivation.
UPDATE users u
SET personal_org_id = o.id
FROM organizations o
WHERE o.id = 'org-' || LOWER(REGEXP_REPLACE(SUBSTRING(u.idp_subject, 1, 40), '[^a-z0-9]', '-', 'g'))
  AND u.personal_org_id IS NULL;

-- 6. Migrate user_profiles.user_id from JWT subject → users.id (platform ULID).
UPDATE user_profiles up
SET user_id = u.id
FROM users u
WHERE u.idp_issuer = '' AND u.idp_subject = up.user_id;

-- Add FK after backfill so user_profiles always references users.id.
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS fk_user_profiles_user;
ALTER TABLE user_profiles ADD CONSTRAINT fk_user_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6b. Backfill other user-reference columns that previously stored JWT subject.
UPDATE project_members pm
SET user_id = u.id
FROM users u
WHERE u.idp_issuer = '' AND u.idp_subject = pm.user_id;

UPDATE project_members pm
SET invited_by = u.id
FROM users u
WHERE pm.invited_by <> ''
    AND u.idp_issuer = ''
    AND u.idp_subject = pm.invited_by;

UPDATE project_invites pi
SET invited_by = u.id
FROM users u
WHERE pi.invited_by <> ''
    AND u.idp_issuer = ''
    AND u.idp_subject = pi.invited_by;

UPDATE org_invites oi
SET invited_by = u.id
FROM users u
WHERE oi.invited_by <> ''
    AND u.idp_issuer = ''
    AND u.idp_subject = oi.invited_by;

UPDATE notifications n
SET user_id = u.id
FROM users u
WHERE u.idp_issuer = '' AND u.idp_subject = n.user_id;

UPDATE deployments d
SET initiated_by = u.id
FROM users u
WHERE d.initiated_by <> ''
    AND u.idp_issuer = ''
    AND u.idp_subject = d.initiated_by;

UPDATE workloads w
SET owner_id = u.id
FROM users u
WHERE w.owner_id <> ''
    AND u.idp_issuer = ''
    AND u.idp_subject = w.owner_id;

-- 7. Migrate organization_members.user_id from JWT subject → users.id.
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS new_user_id TEXT;

UPDATE organization_members om
SET new_user_id = u.id
FROM users u
WHERE u.idp_issuer = '' AND u.idp_subject = om.user_id;

-- Fallback: any orphan row that couldn't be matched keeps the old value temporarily.
UPDATE organization_members SET new_user_id = user_id WHERE new_user_id IS NULL;

ALTER TABLE organization_members DROP CONSTRAINT organization_members_pkey;
DROP INDEX IF EXISTS idx_org_members_user_id;

ALTER TABLE organization_members RENAME COLUMN user_id TO user_id_legacy;
ALTER TABLE organization_members RENAME COLUMN new_user_id TO user_id;

ALTER TABLE organization_members ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_pkey PRIMARY KEY (org_id, user_id);
ALTER TABLE organization_members ADD CONSTRAINT fk_org_members_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);

ALTER TABLE organization_members DROP COLUMN user_id_legacy;
