/**
 * One-time data migration: Portfolio Areas → Org Nodes
 *
 * For each existing PortfolioArea record:
 * 1. Creates (or finds) an OrgNode with isPortfolioArea=true under the ROOT node
 * 2. Updates all Initiatives linked via portfolioAreaId to also set orgNodeId
 * 3. Updates all IntakeRequests linked via portfolioAreaId to also set orgNodeId
 *
 * This script is idempotent — safe to run multiple times.
 *
 * Usage:
 *   cd packages/backend
 *   npx tsx prisma/migrate-portfolio-areas.ts
 */

import { PrismaClient, OrgNodeType } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('Starting portfolio area → org node migration...\n');

  // Find the ROOT org node
  const rootNode = await prisma.orgNode.findFirst({
    where: { type: OrgNodeType.ROOT },
  });

  if (!rootNode) {
    console.error('ERROR: No ROOT OrgNode found. Create an org tree first.');
    process.exit(1);
  }

  // Fetch all portfolio areas
  const portfolioAreas = await prisma.portfolioArea.findMany();
  console.log(`Found ${portfolioAreas.length} portfolio areas to migrate.\n`);

  if (portfolioAreas.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const pa of portfolioAreas) {
      const code = `PA-${slugify(pa.name)}`;

      // Upsert the org node
      let orgNode = await tx.orgNode.findFirst({ where: { code } });

      if (!orgNode) {
        orgNode = await tx.orgNode.create({
          data: {
            name: pa.name,
            code,
            type: OrgNodeType.VIRTUAL,
            parentId: rootNode.id,
            path: `${rootNode.path}/${code}`,
            depth: 1,
            sortOrder: 10,
            isPortfolioArea: true,
          },
        });
        console.log(`  Created OrgNode: ${pa.name} (${code})`);
      } else {
        // Ensure it's flagged as portfolio area
        if (!orgNode.isPortfolioArea) {
          await tx.orgNode.update({
            where: { id: orgNode.id },
            data: { isPortfolioArea: true },
          });
          console.log(`  Updated OrgNode: ${pa.name} → isPortfolioArea=true`);
        } else {
          console.log(`  OrgNode already exists: ${pa.name} (${code})`);
        }
      }

      // Link initiatives
      const initResult = await tx.initiative.updateMany({
        where: { portfolioAreaId: pa.id, orgNodeId: null },
        data: { orgNodeId: orgNode.id },
      });
      if (initResult.count > 0) {
        console.log(`    Linked ${initResult.count} initiatives`);
      }

      // Link intake requests
      const irResult = await tx.intakeRequest.updateMany({
        where: { portfolioAreaId: pa.id, orgNodeId: null },
        data: { orgNodeId: orgNode.id },
      });
      if (irResult.count > 0) {
        console.log(`    Linked ${irResult.count} intake requests`);
      }
    }
  });

  console.log('\nMigration complete!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
