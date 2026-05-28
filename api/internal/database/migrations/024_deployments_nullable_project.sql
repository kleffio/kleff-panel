-- 024_deployments_nullable_project.sql
-- Make project_id optional on deployments so namespace-scoped workloads
-- (created without a project) can have deployment records.

ALTER TABLE deployments ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE deployments ALTER COLUMN project_id DROP DEFAULT;
