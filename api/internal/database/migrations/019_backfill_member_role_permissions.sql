-- 019_backfill_member_role_permissions.sql
-- This migration backfills any under-seeded Member roles that were created
-- before the permission system was fully stabilized, ensuring they have the
-- minimum required permissions to view namespace resources.

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM roles r, permissions p
WHERE r.name = 'Member' AND r.is_system = TRUE
  AND p.key IN ('namespace:view','member:view','environment:view','workload:view','deployment:view','log:view')
ON CONFLICT DO NOTHING;
