-- AlterTable: Add isPortfolioArea to OrgNode
ALTER TABLE "OrgNode" ADD COLUMN "is_portfolio_area" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: OrgNode.isPortfolioArea
CREATE INDEX "OrgNode_is_portfolio_area_idx" ON "OrgNode"("is_portfolio_area");

-- AlterTable: Add orgNodeId to Initiative
ALTER TABLE "Initiative" ADD COLUMN "org_node_id" UUID;

-- CreateIndex: Initiative.orgNodeId
CREATE INDEX "Initiative_org_node_id_idx" ON "Initiative"("org_node_id");

-- AddForeignKey: Initiative -> OrgNode
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_org_node_id_fkey" FOREIGN KEY ("org_node_id") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add orgNodeId to IntakeRequest
ALTER TABLE "intake_requests" ADD COLUMN "org_node_id" UUID;

-- CreateIndex: IntakeRequest.orgNodeId
CREATE INDEX "intake_requests_org_node_id_idx" ON "intake_requests"("org_node_id");

-- AddForeignKey: IntakeRequest -> OrgNode
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_org_node_id_fkey" FOREIGN KEY ("org_node_id") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
