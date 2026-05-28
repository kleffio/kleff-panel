-- 023_workloads_namespace_id.sql
-- Phase 1: Flatten workloads to the Namespace layer.
--
-- Goals:
--   1. Add namespace_id (required) to workloads so servers can live directly
--      under a namespace, without a mandatory project/environment parent.
--   2. Backfill namespace_id for all existing workloads via the existing
--      environments -> namespaces relationship.
--   3. Make project_id and environment_id optional (nullable) so new workloads
--      can be created without them.  Existing rows are unaffected.
--
-- Phase 2 will rename environment_id -> stack_id and handle the RBAC rename.

-- ── 1. Add namespace_id column (nullable first for the backfill) ──────────────

ALTER TABLE workloads
    ADD COLUMN IF NOT EXISTS namespace_id TEXT REFERENCES namespaces(id) ON DELETE CASCADE;

-- ── 2. Backfill from workloads.environment_id -> environments.namespace_id ───
--   Most rows already have environment_id set (from migration 015).

UPDATE workloads w
SET    namespace_id = e.namespace_id
FROM   environments e
WHERE  w.environment_id = e.id
  AND  w.namespace_id IS NULL;

-- Fallback: for any rows that still have project_id but no environment_id,
-- try the old organizations -> namespaces path.
UPDATE workloads w
SET    namespace_id = n.id
FROM   projects p
JOIN   namespaces n ON n.id = p.organization_id
WHERE  w.project_id = p.id
  AND  w.namespace_id IS NULL;

-- ── 3. Enforce NOT NULL now that all rows are backfilled ─────────────────────
-- If any rows could not be backfilled (orphaned legacy data), they will cause
-- a constraint violation here — surface them explicitly rather than silently
-- skipping so the issue can be resolved before this migration is re-run.

ALTER TABLE workloads
    ALTER COLUMN namespace_id SET NOT NULL;

-- ── 4. Add index for fast namespace-scoped listing ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_workloads_namespace_id ON workloads(namespace_id);

-- ── 5. Make project_id and environment_id optional ───────────────────────────
-- Removes NOT NULL constraints so new workloads can be namespace-only.
-- Existing foreign-key and cascade rules are preserved.

ALTER TABLE workloads ALTER COLUMN project_id     DROP NOT NULL;
ALTER TABLE workloads ALTER COLUMN environment_id DROP NOT NULL;

-- project_id still has a NOT NULL DEFAULT '' from the original schema; clear
-- the default so new rows don't get an empty string instead of NULL.
ALTER TABLE workloads ALTER COLUMN project_id DROP DEFAULT;
