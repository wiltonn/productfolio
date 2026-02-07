-- CreateTable
CREATE TABLE "job_profiles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "band" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_profile_skills" (
    "id" UUID NOT NULL,
    "job_profile_id" UUID NOT NULL,
    "skill_name" TEXT NOT NULL,
    "expected_proficiency" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_profile_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_bands" (
    "id" UUID NOT NULL,
    "job_profile_id" UUID NOT NULL,
    "annual_cost_min" DOUBLE PRECISION,
    "annual_cost_max" DOUBLE PRECISION,
    "hourly_rate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effective_date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_bands_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "job_profile_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "job_profiles_name_key" ON "job_profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "job_profile_skills_job_profile_id_skill_name_key" ON "job_profile_skills"("job_profile_id", "skill_name");

-- CreateIndex
CREATE INDEX "job_profile_skills_job_profile_id_idx" ON "job_profile_skills"("job_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_bands_job_profile_id_key" ON "cost_bands"("job_profile_id");

-- CreateIndex
CREATE INDEX "cost_bands_job_profile_id_idx" ON "cost_bands"("job_profile_id");

-- CreateIndex
CREATE INDEX "Employee_job_profile_id_idx" ON "Employee"("job_profile_id");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_job_profile_id_fkey" FOREIGN KEY ("job_profile_id") REFERENCES "job_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_profile_skills" ADD CONSTRAINT "job_profile_skills_job_profile_id_fkey" FOREIGN KEY ("job_profile_id") REFERENCES "job_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_bands" ADD CONSTRAINT "cost_bands_job_profile_id_fkey" FOREIGN KEY ("job_profile_id") REFERENCES "job_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
