-- Migration: Replace old InitiativeStatus enum with milestone-oriented statuses
-- Run this BEFORE prisma db push

BEGIN;

-- Step 1: Add new enum values to existing type
ALTER TYPE "InitiativeStatus" ADD VALUE IF NOT EXISTS 'PROPOSED';
ALTER TYPE "InitiativeStatus" ADD VALUE IF NOT EXISTS 'SCOPING';
ALTER TYPE "InitiativeStatus" ADD VALUE IF NOT EXISTS 'RESOURCING';
ALTER TYPE "InitiativeStatus" ADD VALUE IF NOT EXISTS 'IN_EXECUTION';
ALTER TYPE "InitiativeStatus" ADD VALUE IF NOT EXISTS 'COMPLETE';

COMMIT;

-- Step 2: Update existing rows to new values (must be outside the ADD VALUE transaction)
BEGIN;

UPDATE "Initiative" SET status = 'PROPOSED'      WHERE status = 'DRAFT';
UPDATE "Initiative" SET status = 'PROPOSED'      WHERE status = 'PENDING_APPROVAL';
UPDATE "Initiative" SET status = 'SCOPING'       WHERE status = 'APPROVED';
UPDATE "Initiative" SET status = 'IN_EXECUTION'  WHERE status = 'IN_PROGRESS';
UPDATE "Initiative" SET status = 'COMPLETE'      WHERE status = 'COMPLETED';

-- Step 3: Create the new enum type without old values
CREATE TYPE "InitiativeStatus_new" AS ENUM (
  'PROPOSED',
  'SCOPING',
  'RESOURCING',
  'IN_EXECUTION',
  'COMPLETE',
  'ON_HOLD',
  'CANCELLED'
);

-- Step 4: Swap column type
ALTER TABLE "Initiative"
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE "InitiativeStatus_new" USING status::text::"InitiativeStatus_new",
  ALTER COLUMN status SET DEFAULT 'PROPOSED';

-- Step 5: Drop old type, rename new
DROP TYPE "InitiativeStatus";
ALTER TYPE "InitiativeStatus_new" RENAME TO "InitiativeStatus";

-- Step 6: Add DeliveryHealth enum
DO $$ BEGIN
  CREATE TYPE "DeliveryHealth" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 7: Add new columns
ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "deliveryHealth" "DeliveryHealth";
ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "targetQuarter" TEXT;

-- Step 8: Migrate targetPeriodId to targetQuarter (if targetPeriod has label data)
UPDATE "Initiative" i
SET "targetQuarter" = p.label
FROM "periods" p
WHERE i."target_period_id" = p.id
  AND i."targetQuarter" IS NULL
  AND p.type = 'QUARTER';

-- Step 9: Create index on targetQuarter
CREATE INDEX IF NOT EXISTS "Initiative_targetQuarter_idx" ON "Initiative" ("targetQuarter");

COMMIT;
