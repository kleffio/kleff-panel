-- 017_environment_scoped_members.sql

CREATE TABLE IF NOT EXISTS environment_members (
    namespace_id   TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    environment_id TEXT        NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id        TEXT        NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (environment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_environment_members_user_id ON environment_members(user_id);
CREATE INDEX IF NOT EXISTS idx_environment_members_namespace_id ON environment_members(namespace_id);

CREATE TABLE IF NOT EXISTS environment_invites (
    id             TEXT        PRIMARY KEY,
    namespace_id   TEXT        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    environment_id TEXT        NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    role_id        TEXT        REFERENCES roles(id) ON DELETE SET NULL,
    invited_email  TEXT,
    max_uses       INTEGER,
    use_count      INTEGER     NOT NULL DEFAULT 0,
    token_hash     TEXT        NOT NULL UNIQUE,
    invited_by     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at     TIMESTAMPTZ NOT NULL,
    accepted_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_environment_invites_namespace_id ON environment_invites(namespace_id);
CREATE INDEX IF NOT EXISTS idx_environment_invites_environment_id ON environment_invites(environment_id);
CREATE INDEX IF NOT EXISTS idx_environment_invites_token_hash ON environment_invites(token_hash);
