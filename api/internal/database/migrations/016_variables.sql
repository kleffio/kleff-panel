CREATE TABLE IF NOT EXISTS environment_variables (
    id          TEXT        PRIMARY KEY,
    environment_id TEXT     NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL DEFAULT '',
    is_secret   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_env_vars_env_key   ON environment_variables(environment_id, key);
CREATE INDEX        IF NOT EXISTS idx_env_vars_env_id    ON environment_variables(environment_id);
