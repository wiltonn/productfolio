import { Job } from 'bullmq';
import { InitiativeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { CsvRowSchema } from '../../schemas/initiatives.schema.js';
import type { CsvImportJobData } from '../queue.js';

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  processedAt: string;
}

/**
 * Process CSV import jobs in batches
 *
 * This processor:
 * 1. Validates each row against the schema
 * 2. Verifies owner references exist
 * 3. Creates initiatives in batches
 * 4. Reports progress and errors
 */
export async function processCsvImport(
  job: Job<CsvImportJobData>
): Promise<ImportResult> {
  const { rows, userId, fileName, totalRows } = job.data;

  job.log(`Starting CSV import: ${fileName}`);
  job.log(`Total rows to process: ${totalRows}`);
  job.log(`Initiated by user: ${userId}`);

  const result: ImportResult = {
    success: 0,
    failed: 0,
    errors: [],
    processedAt: new Date().toISOString(),
  };

  const BATCH_SIZE = 50;
  const batches = Math.ceil(rows.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
    const batch = rows.slice(batchStart, batchEnd);

    job.log(`Processing batch ${batchIndex + 1}/${batches} (rows ${batchStart + 1}-${batchEnd})`);

    // Process batch
    const batchResults = await processBatch(batch, batchStart);
    result.success += batchResults.success;
    result.failed += batchResults.failed;
    result.errors.push(...batchResults.errors);

    // Update progress
    const progress = Math.round(((batchIndex + 1) / batches) * 100);
    await job.updateProgress(progress);
  }

  job.log(`Import complete:`);
  job.log(`- Successful: ${result.success}`);
  job.log(`- Failed: ${result.failed}`);
  if (result.errors.length > 0) {
    job.log(`- First few errors:`);
    result.errors.slice(0, 5).forEach((err) => {
      job.log(`  Row ${err.row}: ${err.message}`);
    });
  }

  return result;
}

async function processBatch(
  rows: Array<Record<string, string>>,
  startIndex: number
): Promise<{ success: number; failed: number; errors: Array<{ row: number; message: string }> }> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ row: number; message: string }>,
  };

  // Collect all unique owner IDs to validate in one query
  const businessOwnerIds = new Set<string>();
  const productOwnerIds = new Set<string>();

  for (const row of rows) {
    if (row.businessOwnerId) businessOwnerIds.add(row.businessOwnerId);
    if (row.productOwnerId) productOwnerIds.add(row.productOwnerId);
  }

  // Batch validate owners
  const [existingBusinessOwners, existingProductOwners] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: Array.from(businessOwnerIds) } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { id: { in: Array.from(productOwnerIds) } },
      select: { id: true },
    }),
  ]);

  const validBusinessOwnerIds = new Set(existingBusinessOwners.map((u) => u.id));
  const validProductOwnerIds = new Set(existingProductOwners.map((u) => u.id));

  // Process each row
  const initiativesToCreate: Prisma.InitiativeCreateManyInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = startIndex + i + 2; // +2 for 1-indexed and header row

    try {
      // Validate row schema
      const validatedRow = CsvRowSchema.parse(row);

      // Check business owner exists
      if (!validBusinessOwnerIds.has(validatedRow.businessOwnerId)) {
        results.failed++;
        results.errors.push({
          row: rowNumber,
          message: `Business owner with ID '${validatedRow.businessOwnerId}' not found`,
        });
        continue;
      }

      // Check product owner exists
      if (!validProductOwnerIds.has(validatedRow.productOwnerId)) {
        results.failed++;
        results.errors.push({
          row: rowNumber,
          message: `Product owner with ID '${validatedRow.productOwnerId}' not found`,
        });
        continue;
      }

      // Prepare for batch insert
      initiativesToCreate.push({
        title: validatedRow.title,
        description: validatedRow.description || null,
        businessOwnerId: validatedRow.businessOwnerId,
        productOwnerId: validatedRow.productOwnerId,
        status: validatedRow.status || InitiativeStatus.DRAFT,
        targetPeriodId: validatedRow.targetPeriodId || null,
        customFields: Prisma.JsonNull,
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Validation error',
      });
    }
  }

  // Batch create initiatives
  if (initiativesToCreate.length > 0) {
    try {
      await prisma.initiative.createMany({
        data: initiativesToCreate,
        skipDuplicates: true,
      });
    } catch (error) {
      // If batch insert fails, fall back to individual inserts
      for (const initiative of initiativesToCreate) {
        try {
          await prisma.initiative.create({ data: initiative });
        } catch (createError) {
          results.failed++;
          results.success--;
          results.errors.push({
            row: 0, // We lose the specific row info in batch mode
            message: `Failed to create initiative "${initiative.title}": ${createError instanceof Error ? createError.message : 'Unknown error'}`,
          });
        }
      }
    }
  }

  return results;
}
