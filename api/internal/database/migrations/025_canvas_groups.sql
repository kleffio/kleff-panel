CREATE TABLE IF NOT EXISTS canvas_groups (
  id           TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '',
  member_ids   JSONB NOT NULL DEFAULT '[]',
  notes        TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT '',
  pos_x        DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y        DOUBLE PRECISION NOT NULL DEFAULT 0,
  width        DOUBLE PRECISION NOT NULL DEFAULT 380,
  height       DOUBLE PRECISION NOT NULL DEFAULT 280,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_groups_namespace_id ON canvas_groups(namespace_id);
