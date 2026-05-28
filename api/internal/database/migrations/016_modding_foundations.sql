-- Add modloader to blueprints so the mod browser knows which loader the blueprint targets.
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS modloader TEXT NOT NULL DEFAULT '';

-- Add game_version and modloader to workloads so the mod browser can filter
-- mods by the exact version and loader the server is running.
ALTER TABLE workloads
    ADD COLUMN IF NOT EXISTS game_version TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS modloader    TEXT NOT NULL DEFAULT '';
