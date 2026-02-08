# Prisma/DB Engineer Plan — Strangler Token Flow

## Overview
Three tasks spanning Phase 1 and Phase 3. All changes are ADDITIVE only. No existing fields, enums, or models will be modified.

---

## Task #1 — PlanningMode enum + Scenario.planningMode (Phase 1)

### Changes to `packages/backend/prisma/schema.prisma`

**1. Add new enum** (after the existing `ForecastMode` enum, ~line 155):
```prisma
enum PlanningMode {
  LEGACY
  TOKEN
}
```

**2. Add field to Scenario model** (after `needsReconciliation`, ~line 469):
```prisma
planningMode  PlanningMode @default(LEGACY) @map("planning_mode")
```

**3. Add index to Scenario** (after existing `@@index([revisionOfScenarioId])`):
```prisma
@@index([planningMode])
```

### Migration
- Run from `packages/backend/`: `npx prisma migrate dev --name add_planning_mode`
- Then `npx prisma generate`
- If tables already exist in DB, use `prisma migrate resolve --applied`

### Risk: None. Purely additive enum + nullable-defaulted field.

---

## Task #8 — SkillPool, TokenSupply, TokenDemand, TokenCalibration (Phase 3)

### Changes to `packages/backend/prisma/schema.prisma`

Add a new section after the "Initiative Status Log" section:

```prisma
// ============================================================================
// Token Planning (Skill Pools & Token Ledger)
// ============================================================================

model SkillPool {
  id          String  @id @default(uuid()) @db.Uuid
  name        String  @unique
  description String? @db.Text
  isActive    Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  tokenSupplies     TokenSupply[]
  tokenDemands      TokenDemand[]
  tokenCalibrations TokenCalibration[]

  @@index([name])
  @@index([isActive])
  @@map("skill_pools")
}

model TokenSupply {
  id          String   @id @default(uuid()) @db.Uuid
  scenarioId  String   @map("scenario_id") @db.Uuid
  skillPoolId String   @map("skill_pool_id") @db.Uuid
  tokens      Float
  notes       String?  @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  skillPool SkillPool @relation(fields: [skillPoolId], references: [id], onDelete: Cascade)

  @@unique([scenarioId, skillPoolId])
  @@index([scenarioId])
  @@index([skillPoolId])
  @@map("token_supplies")
}

model TokenDemand {
  id           String  @id @default(uuid()) @db.Uuid
  scenarioId   String  @map("scenario_id") @db.Uuid
  initiativeId String  @map("initiative_id") @db.Uuid
  skillPoolId  String  @map("skill_pool_id") @db.Uuid
  tokensP50    Float   @map("tokens_p50")
  tokensP90    Float?  @map("tokens_p90")
  notes        String? @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  skillPool SkillPool @relation(fields: [skillPoolId], references: [id], onDelete: Cascade)

  @@unique([scenarioId, initiativeId, skillPoolId])
  @@index([scenarioId])
  @@index([initiativeId])
  @@index([skillPoolId])
  @@map("token_demands")
}

model TokenCalibration {
  id            String   @id @default(uuid()) @db.Uuid
  skillPoolId   String   @map("skill_pool_id") @db.Uuid
  tokenPerHour  Float    @default(1.0) @map("token_per_hour")
  effectiveDate DateTime @map("effective_date") @db.Date
  notes         String?  @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  skillPool SkillPool @relation(fields: [skillPoolId], references: [id], onDelete: Cascade)

  @@unique([skillPoolId, effectiveDate])
  @@index([skillPoolId])
  @@map("token_calibrations")
}
```

### Design decisions
- **No Prisma relation from TokenSupply/TokenDemand to Scenario** — as specified, to avoid modifying the existing Scenario model. FK will be enforced at application level.
- **No Prisma relation from TokenDemand to Initiative** — same reason, avoids modifying the existing Initiative model.
- **SkillPool.name is @unique** — enables upsert by name for seeding.
- **TokenSupply unique on (scenarioId, skillPoolId)** — one supply entry per pool per scenario.
- **TokenDemand unique on (scenarioId, initiativeId, skillPoolId)** — one demand entry per initiative per pool per scenario.
- **TokenCalibration unique on (skillPoolId, effectiveDate)** — one rate per pool per date.

### Migration
- Run from `packages/backend/`: `npx prisma migrate dev --name add_token_domain_tables`
- Then `npx prisma generate`
- If tables already exist in DB, use `prisma migrate resolve --applied`

### Risk: None. Four new tables, no modifications to existing tables.

---

## Task #9 — Seed default skill pools + token_planning_v1 feature flag (Phase 3)

### New file: `packages/backend/prisma/seed-skill-pools.ts`

```ts
/**
 * Seed Default Skill Pools + Token Planning Feature Flag
 *
 * Run: npx tsx prisma/seed-skill-pools.ts
 * (from packages/backend/)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Upsert 5 default skill pools
  const pools = [
    { name: 'backend', description: 'Backend development capacity' },
    { name: 'frontend', description: 'Frontend development capacity' },
    { name: 'data', description: 'Data engineering and analytics capacity' },
    { name: 'qa', description: 'Quality assurance and testing capacity' },
    { name: 'domain', description: 'Domain expertise and product knowledge' },
  ];

  for (const pool of pools) {
    await prisma.skillPool.upsert({
      where: { name: pool.name },
      update: {},
      create: pool,
    });
    console.log(`Upserted skill pool: ${pool.name}`);
  }

  // 2. Upsert token_planning_v1 feature flag (disabled by default)
  const flag = await prisma.featureFlag.upsert({
    where: { key: 'token_planning_v1' },
    update: {},
    create: {
      key: 'token_planning_v1',
      enabled: false,
      description: 'Enable Token+Flow planning mode for scenarios',
    },
  });
  console.log(`Upserted feature flag: ${flag.key} (enabled: ${flag.enabled})`);

  console.log('Seed complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### Also update `packages/backend/prisma/seed.ts`
Add `token_planning_v1` to the featureFlags array (alongside the existing 4 flags) so it is also created by the main seed script:
```ts
{ key: 'token_planning_v1', description: 'Enable Token+Flow planning mode for scenarios' },
```

---

## Execution Order

1. **Task #1** first (Phase 1) — PlanningMode enum + Scenario field + migration + generate
2. **Task #8** next (Phase 3, blocked by #1) — 4 new models + migration + generate
3. **Task #9** last (Phase 3, blocked by #8) — Seed script + flag in main seed

## Verification
- After each migration: `npx prisma generate` succeeds
- After Task #9: run `npx tsx prisma/seed-skill-pools.ts` to verify seed works
- No existing tests should be affected (purely additive schema changes)
