-- Migration: backfill project_invites into namespace_invites
-- This is a safe, idempotent migration. Existing rows in namespace_invites
-- (from dual-write) are left untouched via ON CONFLICT DO NOTHING.
--
-- For each project_invite, we resolve the namespace_id (from the linked
-- environment, or the project's organization_id), find the default Member
-- role for that namespace, and insert into namespace_invites.

INSERT INTO namespace_invites
    (id, namespace_id, role_id, invited_email, max_uses, use_count,
     token_hash, invited_by, expires_at, accepted_at, created_at)
SELECT
    pi.id,
    COALESCE(
        (SELECT e.namespace_id FROM environments e WHERE e.id = pi.project_id),
        (SELECT p.organization_id FROM projects p WHERE p.id = pi.project_id)
    ) AS namespace_id,
    (
        SELECT r.id FROM roles r
        WHERE r.namespace_id = COALESCE(
            (SELECT e.namespace_id FROM environments e WHERE e.id = pi.project_id),
            (SELECT p.organization_id FROM projects p WHERE p.id = pi.project_id)
        )
        AND LOWER(r.name) = 'member'
        AND r.is_system = TRUE
        LIMIT 1
    ) AS role_id,
    pi.invited_email,
    NULL AS max_uses,
    0    AS use_count,
    pi.token_hash,
    pi.invited_by,
    pi.expires_at,
    pi.accepted_at,
    pi.created_at
FROM project_invites pi
WHERE
    -- Only backfill rows for which we can resolve a namespace.
    COALESCE(
        (SELECT e.namespace_id FROM environments e WHERE e.id = pi.project_id),
        (SELECT p.organization_id FROM projects p WHERE p.id = pi.project_id)
    ) IS NOT NULL
ON CONFLICT (id) DO NOTHING;
