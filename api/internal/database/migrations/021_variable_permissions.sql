-- Add variable permissions that were missing from the initial seed.
-- Grant them to all existing Owner roles.

INSERT INTO permissions (key, description) VALUES
    ('variable:create', 'Create environment variables'),
    ('variable:manage', 'Edit environment variables'),
    ('variable:delete', 'Delete environment variables'),
    ('variable:view',   'View environment variables')
ON CONFLICT (key) DO NOTHING;

-- Grant variable permissions to all existing Owner roles.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner' AND r.is_system = TRUE
  AND p.key IN ('variable:create', 'variable:manage', 'variable:delete', 'variable:view')
ON CONFLICT DO NOTHING;
