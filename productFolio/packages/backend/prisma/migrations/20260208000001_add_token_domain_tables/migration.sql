-- CreateTable
CREATE TABLE "skill_pools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_supplies" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "skill_pool_id" UUID NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_demands" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "initiative_id" UUID NOT NULL,
    "skill_pool_id" UUID NOT NULL,
    "tokens_p50" DOUBLE PRECISION NOT NULL,
    "tokens_p90" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_calibrations" (
    "id" UUID NOT NULL,
    "skill_pool_id" UUID NOT NULL,
    "token_per_hour" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "effective_date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_calibrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_pools_name_key" ON "skill_pools"("name");

-- CreateIndex
CREATE INDEX "skill_pools_name_idx" ON "skill_pools"("name");

-- CreateIndex
CREATE INDEX "skill_pools_isActive_idx" ON "skill_pools"("isActive");

-- CreateIndex
CREATE INDEX "token_supplies_scenario_id_idx" ON "token_supplies"("scenario_id");

-- CreateIndex
CREATE INDEX "token_supplies_skill_pool_id_idx" ON "token_supplies"("skill_pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_supplies_scenario_id_skill_pool_id_key" ON "token_supplies"("scenario_id", "skill_pool_id");

-- CreateIndex
CREATE INDEX "token_demands_scenario_id_idx" ON "token_demands"("scenario_id");

-- CreateIndex
CREATE INDEX "token_demands_initiative_id_idx" ON "token_demands"("initiative_id");

-- CreateIndex
CREATE INDEX "token_demands_skill_pool_id_idx" ON "token_demands"("skill_pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_demands_scenario_id_initiative_id_skill_pool_id_key" ON "token_demands"("scenario_id", "initiative_id", "skill_pool_id");

-- CreateIndex
CREATE INDEX "token_calibrations_skill_pool_id_idx" ON "token_calibrations"("skill_pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_calibrations_skill_pool_id_effective_date_key" ON "token_calibrations"("skill_pool_id", "effective_date");

-- AddForeignKey
ALTER TABLE "token_supplies" ADD CONSTRAINT "token_supplies_skill_pool_id_fkey" FOREIGN KEY ("skill_pool_id") REFERENCES "skill_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_demands" ADD CONSTRAINT "token_demands_skill_pool_id_fkey" FOREIGN KEY ("skill_pool_id") REFERENCES "skill_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_calibrations" ADD CONSTRAINT "token_calibrations_skill_pool_id_fkey" FOREIGN KEY ("skill_pool_id") REFERENCES "skill_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
