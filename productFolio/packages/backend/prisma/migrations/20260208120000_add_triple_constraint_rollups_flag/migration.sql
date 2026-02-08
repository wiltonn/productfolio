-- Seed triple_constraint_rollups_v1 feature flag
INSERT INTO "feature_flags" ("id", "key", "name", "description", "enabled", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'triple_constraint_rollups_v1', 'Triple Constraint Rollups', 'Aggregated scope/budget/timeline rollups by portfolio area, org node, and business owner', false, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
