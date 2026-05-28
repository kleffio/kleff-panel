-- Vercel-model: all memberships are namespace-level.
-- Environments can be "limited access" (opt-in); when true,
-- only users with an explicit grant row can see/use the environment.

ALTER TABLE environments
    ADD COLUMN limited_access BOOLEAN NOT NULL DEFAULT FALSE;

-- Additive per-environment grants (only meaningful when limited_access = true).
CREATE TABLE environment_access_grants (
    environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    user_id        TEXT NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    granted_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- Optional env-scoped role. When set, overrides the member's NS role for
    -- permission checks within this specific environment.
    role_id        TEXT REFERENCES roles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (environment_id, user_id)
);
CREATE INDEX ON environment_access_grants (environment_id);
CREATE INDEX ON environment_access_grants (user_id);

-- NS invites can optionally auto-grant access to a specific environment on accept.
ALTER TABLE namespace_invites
    ADD COLUMN grant_environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL;
