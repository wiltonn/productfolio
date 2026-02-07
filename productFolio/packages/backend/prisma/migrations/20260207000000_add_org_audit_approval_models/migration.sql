-- ============================================================================
-- Formalize OrgNode, OrgMembership, AuditEvent, and Approval workflow models
-- These tables already exist in the runtime database.
-- This migration is marked as applied via `prisma migrate resolve --applied`.
-- ============================================================================

-- CreateEnum
CREATE TYPE "OrgNodeType" AS ENUM ('ROOT', 'DIVISION', 'DEPARTMENT', 'TEAM', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "ApprovalScope" AS ENUM ('RESOURCE_ALLOCATION', 'INITIATIVE', 'SCENARIO');

-- CreateEnum
CREATE TYPE "ApprovalRuleType" AS ENUM ('NODE_MANAGER', 'SPECIFIC_PERSON', 'ROLE_BASED', 'ANCESTOR_MANAGER', 'COMMITTEE', 'FALLBACK_ADMIN');

-- CreateEnum
CREATE TYPE "CrossBuStrategy" AS ENUM ('COMMON_ANCESTOR', 'ALL_BRANCHES');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalDecisionType" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrgNode" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "OrgNodeType" NOT NULL,
    "parentId" UUID,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "managerId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMembership" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "orgNodeId" UUID NOT NULL,
    "effectiveStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" UUID NOT NULL,
    "orgNodeId" UUID NOT NULL,
    "scope" "ApprovalScope" NOT NULL,
    "level" INTEGER NOT NULL,
    "ruleType" "ApprovalRuleType" NOT NULL,
    "ruleConfig" JSONB NOT NULL DEFAULT '{}',
    "crossBuStrategy" "CrossBuStrategy" NOT NULL DEFAULT 'COMMON_ANCESTOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "scope" "ApprovalScope" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "requesterId" UUID NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "snapshotChain" JSONB NOT NULL,
    "snapshotContext" JSONB NOT NULL DEFAULT '{}',
    "currentLevel" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "deciderId" UUID NOT NULL,
    "decision" "ApprovalDecisionType" NOT NULL,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDelegation" (
    "id" UUID NOT NULL,
    "delegatorId" UUID NOT NULL,
    "delegateId" UUID NOT NULL,
    "scope" "ApprovalScope",
    "orgNodeId" UUID,
    "effectiveStart" TIMESTAMP(3) NOT NULL,
    "effectiveEnd" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgNode_code_key" ON "OrgNode"("code");

-- CreateIndex
CREATE INDEX "OrgNode_parentId_idx" ON "OrgNode"("parentId");

-- CreateIndex
CREATE INDEX "OrgNode_type_idx" ON "OrgNode"("type");

-- CreateIndex
CREATE INDEX "OrgNode_managerId_idx" ON "OrgNode"("managerId");

-- CreateIndex
CREATE INDEX "OrgNode_isActive_idx" ON "OrgNode"("isActive");

-- CreateIndex
CREATE INDEX "OrgMembership_employeeId_idx" ON "OrgMembership"("employeeId");

-- CreateIndex
CREATE INDEX "OrgMembership_orgNodeId_idx" ON "OrgMembership"("orgNodeId");

-- CreateIndex
CREATE INDEX "OrgMembership_effectiveEnd_idx" ON "OrgMembership"("effectiveEnd");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_orgNodeId_idx" ON "ApprovalPolicy"("orgNodeId");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_scope_idx" ON "ApprovalPolicy"("scope");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_isActive_idx" ON "ApprovalPolicy"("isActive");

-- CreateIndex
CREATE INDEX "ApprovalRequest_scope_idx" ON "ApprovalRequest"("scope");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requesterId_idx" ON "ApprovalRequest"("requesterId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_subjectType_subjectId_idx" ON "ApprovalRequest"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ApprovalDecision_requestId_idx" ON "ApprovalDecision"("requestId");

-- CreateIndex
CREATE INDEX "ApprovalDecision_deciderId_idx" ON "ApprovalDecision"("deciderId");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_delegatorId_idx" ON "ApprovalDelegation"("delegatorId");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_delegateId_idx" ON "ApprovalDelegation"("delegateId");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_effectiveStart_effectiveEnd_idx" ON "ApprovalDelegation"("effectiveStart", "effectiveEnd");

-- AddForeignKey
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_deciderId_fkey" FOREIGN KEY ("deciderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_delegatorId_fkey" FOREIGN KEY ("delegatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
