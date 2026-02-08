-- AlterEnum: Add new OrgNodeType values
ALTER TYPE "OrgNodeType" ADD VALUE IF NOT EXISTS 'PRODUCT';
ALTER TYPE "OrgNodeType" ADD VALUE IF NOT EXISTS 'PLATFORM';
ALTER TYPE "OrgNodeType" ADD VALUE IF NOT EXISTS 'FUNCTIONAL';
ALTER TYPE "OrgNodeType" ADD VALUE IF NOT EXISTS 'CHAPTER';

-- CreateEnum: EmployeeOrgRelationshipType
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeOrgRelationshipType') THEN
    CREATE TYPE "EmployeeOrgRelationshipType" AS ENUM (
      'PRIMARY_REPORTING',
      'DELIVERY_ASSIGNMENT',
      'FUNCTIONAL_ALIGNMENT',
      'CAPABILITY_POOL',
      'TEMPORARY_ROTATION'
    );
  END IF;
END
$$;

-- CreateTable: employee_org_unit_links
CREATE TABLE IF NOT EXISTS "employee_org_unit_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "org_node_id" UUID NOT NULL,
    "relationship_type" "EmployeeOrgRelationshipType" NOT NULL,
    "allocation_pct" DOUBLE PRECISION,
    "consume_capacity" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_org_unit_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "employee_org_unit_links_employee_id_relationship_type_end_da_idx"
  ON "employee_org_unit_links"("employee_id", "relationship_type", "end_date");

CREATE INDEX IF NOT EXISTS "employee_org_unit_links_org_node_id_relationship_type_end_da_idx"
  ON "employee_org_unit_links"("org_node_id", "relationship_type", "end_date");

CREATE INDEX IF NOT EXISTS "employee_org_unit_links_employee_id_idx"
  ON "employee_org_unit_links"("employee_id");

CREATE INDEX IF NOT EXISTS "employee_org_unit_links_org_node_id_idx"
  ON "employee_org_unit_links"("org_node_id");

CREATE INDEX IF NOT EXISTS "employee_org_unit_links_consume_capacity_idx"
  ON "employee_org_unit_links"("consume_capacity");

-- AddForeignKey: employee_id -> Employee
ALTER TABLE "employee_org_unit_links"
  ADD CONSTRAINT "employee_org_unit_links_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: org_node_id -> OrgNode
ALTER TABLE "employee_org_unit_links"
  ADD CONSTRAINT "employee_org_unit_links_org_node_id_fkey"
  FOREIGN KEY ("org_node_id") REFERENCES "OrgNode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: at most ONE active PRIMARY_REPORTING per employee
-- (enforced at DB level for maximum safety)
CREATE UNIQUE INDEX IF NOT EXISTS "employee_org_unit_links_one_active_primary"
  ON "employee_org_unit_links"("employee_id")
  WHERE "relationship_type" = 'PRIMARY_REPORTING' AND "end_date" IS NULL;
