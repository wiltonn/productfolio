-- CreateEnum
CREATE TYPE "ForecastMode" AS ENUM ('SCOPE_BASED', 'EMPIRICAL');

-- CreateTable
CREATE TABLE "forecast_runs" (
    "id" UUID NOT NULL,
    "mode" "ForecastMode" NOT NULL,
    "scenario_id" UUID,
    "org_node_id" UUID,
    "initiative_ids" JSONB NOT NULL,
    "simulation_count" INTEGER NOT NULL DEFAULT 1000,
    "confidence_levels" JSONB NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "warnings" JSONB,
    "data_quality" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "initiative_status_logs" (
    "id" UUID NOT NULL,
    "initiative_id" UUID NOT NULL,
    "from_status" "InitiativeStatus" NOT NULL,
    "to_status" "InitiativeStatus" NOT NULL,
    "transitioned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,

    CONSTRAINT "initiative_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecast_runs_scenario_id_idx" ON "forecast_runs"("scenario_id");

-- CreateIndex
CREATE INDEX "forecast_runs_mode_idx" ON "forecast_runs"("mode");

-- CreateIndex
CREATE INDEX "initiative_status_logs_initiative_id_idx" ON "initiative_status_logs"("initiative_id");

-- CreateIndex
CREATE INDEX "initiative_status_logs_to_status_idx" ON "initiative_status_logs"("to_status");

-- AddForeignKey
ALTER TABLE "initiative_status_logs" ADD CONSTRAINT "initiative_status_logs_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
