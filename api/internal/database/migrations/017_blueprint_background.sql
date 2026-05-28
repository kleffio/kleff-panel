-- Add background image URL to blueprints for display in the server creation UI.
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS background TEXT NOT NULL DEFAULT '';
