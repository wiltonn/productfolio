-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'LOCKED');

-- Step 1: Add new columns to Scenario (period_id nullable initially for backfill)
ALTER TABLE "Scenario" ADD COLUMN "period_id" UUID;
ALTER TABLE "Scenario" ADD COLUMN "status" "ScenarioStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Scenario" ADD COLUMN "plan_lock_date" TIMESTAMP(3);

-- Step 2: Backfill period_id from scenario_periods (first period per scenario)
UPDATE "Scenario" s
SET "period_id" = sp."period_id"
FROM (
    SELECT DISTINCT ON ("scenario_id") "scenario_id", "period_id"
    FROM "scenario_periods"
    ORDER BY "scenario_id", "period_id"
) sp
WHERE s."id" = sp."scenario_id";

-- Step 3: For any scenarios without a period (orphaned), assign the first available QUARTER period
UPDATE "Scenario"
SET "period_id" = (
    SELECT "id" FROM "periods" WHERE "type" = 'QUARTER' ORDER BY "start_date" LIMIT 1
)
WHERE "period_id" IS NULL;

-- Step 4: Make period_id NOT NULL now that all rows are backfilled
ALTER TABLE "Scenario" ALTER COLUMN "period_id" SET NOT NULL;

-- Step 5: Drop ScenarioPeriod junction table and its foreign keys
ALTER TABLE "scenario_periods" DROP CONSTRAINT IF EXISTS "scenario_periods_period_id_fkey";
ALTER TABLE "scenario_periods" DROP CONSTRAINT IF EXISTS "scenario_periods_scenario_id_fkey";
DROP TABLE IF EXISTS "scenario_periods";

-- Step 6: Delete allocations whose date range falls entirely outside their scenario's quarter
DELETE FROM "Allocation" a
USING "Scenario" s, "periods" p
WHERE a."scenarioId" = s."id"
  AND s."period_id" = p."id"
  AND (a."endDate" < p."start_date" OR a."startDate" > p."end_date");

-- Step 7: Create indexes
CREATE INDEX "Scenario_period_id_idx" ON "Scenario"("period_id");
CREATE INDEX "Scenario_status_idx" ON "Scenario"("status");

-- Step 8: Add foreign key constraint
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
