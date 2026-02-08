-- CreateEnum
CREATE TYPE "PlanningMode" AS ENUM ('LEGACY', 'TOKEN');

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "planning_mode" "PlanningMode" NOT NULL DEFAULT 'LEGACY';

-- CreateIndex
CREATE INDEX "Scenario_planning_mode_idx" ON "Scenario"("planning_mode");
