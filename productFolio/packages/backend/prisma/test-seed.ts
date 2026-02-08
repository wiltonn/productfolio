/**
 * Test Seed Script
 *
 * Seeds the database with test data for E2E tests and development.
 * Run with: npm run db:seed:test
 */

import { PrismaClient, UserRole, InitiativeStatus, EmploymentType, PeriodType, ScenarioStatus, ScenarioType, AllocationType, OrgNodeType } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding test data...');

  // ============================================================================
  // USERS
  // ============================================================================

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@productfolio.test' },
    update: {},
    create: {
      email: 'admin@productfolio.test',
      name: 'Test Admin',
      passwordHash: await argon2.hash('Admin123!'),
      role: UserRole.ADMIN,
    },
  });
  console.log('Created admin user');

  const plannerUser = await prisma.user.upsert({
    where: { email: 'planner@productfolio.test' },
    update: {},
    create: {
      email: 'planner@productfolio.test',
      name: 'Test Planner',
      passwordHash: await argon2.hash('Planner123!'),
      role: UserRole.PRODUCT_OWNER,
    },
  });
  console.log('Created planner user');

  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@productfolio.test' },
    update: {},
    create: {
      email: 'viewer@productfolio.test',
      name: 'Test Viewer',
      passwordHash: await argon2.hash('Viewer123!'),
      role: UserRole.VIEWER,
    },
  });
  console.log('Created viewer user');

  // ============================================================================
  // PERIODS
  // ============================================================================

  let q1Period = await prisma.period.findFirst({
    where: { type: PeriodType.QUARTER, year: 2026, ordinal: 1 },
  });
  if (!q1Period) {
    q1Period = await prisma.period.create({
      data: {
        type: PeriodType.QUARTER,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
        label: '2026-Q1',
        year: 2026,
        ordinal: 1,
      },
    });
  }
  console.log(`Created period: ${q1Period.label}`);

  let q2Period = await prisma.period.findFirst({
    where: { type: PeriodType.QUARTER, year: 2026, ordinal: 2 },
  });
  if (!q2Period) {
    q2Period = await prisma.period.create({
      data: {
        type: PeriodType.QUARTER,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-06-30'),
        label: '2026-Q2',
        year: 2026,
        ordinal: 2,
      },
    });
  }
  console.log(`Created period: ${q2Period.label}`);

  // ============================================================================
  // PORTFOLIO AREAS
  // ============================================================================

  const portfolioAreaNames = ['Customer Experience', 'Platform Engineering', 'Data & Analytics', 'Security & Compliance'];
  const portfolioAreas: Record<string, Awaited<ReturnType<typeof prisma.portfolioArea.create>>> = {};

  for (const name of portfolioAreaNames) {
    let area = await prisma.portfolioArea.findUnique({ where: { name } });
    if (!area) {
      area = await prisma.portfolioArea.create({ data: { name } });
    }
    portfolioAreas[name] = area;
  }
  console.log(`Created ${portfolioAreaNames.length} portfolio areas`);

  // ============================================================================
  // ORG TREE + PORTFOLIO AREA NODES
  // ============================================================================

  let rootNode = await prisma.orgNode.findFirst({ where: { type: OrgNodeType.ROOT } });
  if (!rootNode) {
    rootNode = await prisma.orgNode.create({
      data: { name: 'Test Corp', code: 'TC', type: OrgNodeType.ROOT, path: '/TC', depth: 0, sortOrder: 0 },
    });
  }

  const portfolioAreaOrgNodes: Record<string, Awaited<ReturnType<typeof prisma.orgNode.create>>> = {};
  const paNodeDefs = [
    { name: 'Customer Experience', code: 'PA-CUST-EXP', sortOrder: 10 },
    { name: 'Platform Engineering', code: 'PA-PLAT-ENG', sortOrder: 11 },
    { name: 'Data & Analytics', code: 'PA-DATA-ANLY', sortOrder: 12 },
    { name: 'Security & Compliance', code: 'PA-SEC-COMP', sortOrder: 13 },
  ];
  for (const pa of paNodeDefs) {
    let node = await prisma.orgNode.findFirst({ where: { code: pa.code } });
    if (!node) {
      node = await prisma.orgNode.create({
        data: {
          name: pa.name,
          code: pa.code,
          type: OrgNodeType.VIRTUAL,
          parentId: rootNode.id,
          path: `${rootNode.path}/${pa.code}`,
          depth: 1,
          sortOrder: pa.sortOrder,
          isPortfolioArea: true,
        },
      });
    }
    portfolioAreaOrgNodes[pa.name] = node;
  }
  console.log('Created portfolio area org nodes');

  // Build portfolioAreaId → orgNodeId mapping
  const paIdToOrgNodeId: Record<string, string> = {};
  for (const [paName, paRecord] of Object.entries(portfolioAreas)) {
    if (portfolioAreaOrgNodes[paName]) {
      paIdToOrgNodeId[paRecord.id] = portfolioAreaOrgNodes[paName].id;
    }
  }

  // ============================================================================
  // EMPLOYEES
  // ============================================================================

  const employees = [];

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Alice Johnson',
        role: 'Senior Frontend Engineer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: {
          create: [
            { name: 'frontend', proficiency: 5 },
            { name: 'react', proficiency: 5 },
            { name: 'typescript', proficiency: 4 },
          ],
        },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Bob Smith',
        role: 'Backend Engineer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: {
          create: [
            { name: 'backend', proficiency: 5 },
            { name: 'nodejs', proficiency: 4 },
            { name: 'python', proficiency: 3 },
          ],
        },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Carol Davis',
        role: 'Full Stack Engineer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: {
          create: [
            { name: 'frontend', proficiency: 4 },
            { name: 'backend', proficiency: 4 },
            { name: 'devops', proficiency: 3 },
          ],
        },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'David Lee',
        role: 'Product Designer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: {
          create: [
            { name: 'design', proficiency: 5 },
            { name: 'ux', proficiency: 5 },
            { name: 'frontend', proficiency: 2 },
          ],
        },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Eve Martinez',
        role: 'DevOps Engineer',
        employmentType: EmploymentType.CONTRACTOR,
        hoursPerWeek: 32,
        skills: {
          create: [
            { name: 'devops', proficiency: 5 },
            { name: 'infrastructure', proficiency: 4 },
            { name: 'security', proficiency: 3 },
          ],
        },
      },
    })
  );

  console.log(`Created ${employees.length} employees`);

  // Create capacity calendar entries for all employees
  for (const emp of employees) {
    const hoursPerWeek = emp.hoursPerWeek;
    // ~13 weeks in a quarter
    const quarterlyHours = hoursPerWeek * 13;

    await prisma.capacityCalendar.createMany({
      data: [
        { employeeId: emp.id, periodId: q1Period.id, hoursAvailable: quarterlyHours },
        { employeeId: emp.id, periodId: q2Period.id, hoursAvailable: quarterlyHours },
      ],
    });
  }
  console.log('Created capacity calendar entries');

  // ============================================================================
  // INITIATIVES
  // ============================================================================

  const initiatives = [];

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'Customer Portal Redesign',
        description: 'Modernize the customer portal with improved UX and performance',
        status: InitiativeStatus.IN_EXECUTION,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'ON_TRACK',
        domainComplexity: 'MEDIUM',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        portfolioAreaId: portfolioAreas['Customer Experience'].id,
        orgNodeId: paIdToOrgNodeId[portfolioAreas['Customer Experience'].id] || null,
        customFields: {
          tags: ['frontend', 'ux', 'high-priority'],
          budget: 150000,
        },
      },
    })
  );

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'API Gateway Migration',
        description: 'Migrate from legacy gateway to modern API infrastructure',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'AT_RISK',
        domainComplexity: 'HIGH',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        portfolioAreaId: portfolioAreas['Platform Engineering'].id,
        orgNodeId: paIdToOrgNodeId[portfolioAreas['Platform Engineering'].id] || null,
        customFields: {
          tags: ['backend', 'infrastructure'],
          budget: 200000,
        },
      },
    })
  );

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'Mobile App v2',
        description: 'Build next generation mobile app with offline support',
        status: InitiativeStatus.SCOPING,
        targetQuarter: '2026-Q2',
        targetPeriodId: q2Period.id,
        deliveryHealth: 'ON_TRACK',
        domainComplexity: 'MEDIUM',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        portfolioAreaId: portfolioAreas['Customer Experience'].id,
        orgNodeId: paIdToOrgNodeId[portfolioAreas['Customer Experience'].id] || null,
        customFields: {
          tags: ['mobile', 'ios', 'android'],
          budget: 300000,
        },
      },
    })
  );

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'Analytics Dashboard',
        description: 'Real-time analytics dashboard for business intelligence',
        status: InitiativeStatus.PROPOSED,
        targetQuarter: '2026-Q2',
        targetPeriodId: q2Period.id,
        domainComplexity: 'LOW',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        portfolioAreaId: portfolioAreas['Data & Analytics'].id,
        orgNodeId: paIdToOrgNodeId[portfolioAreas['Data & Analytics'].id] || null,
        customFields: {
          tags: ['analytics', 'data'],
          budget: 100000,
        },
      },
    })
  );

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'Security Audit Implementation',
        description: 'Implement recommendations from security audit',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'ON_TRACK',
        domainComplexity: 'HIGH',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        portfolioAreaId: portfolioAreas['Security & Compliance'].id,
        orgNodeId: paIdToOrgNodeId[portfolioAreas['Security & Compliance'].id] || null,
        customFields: {
          tags: ['security', 'compliance', 'urgent'],
          budget: 75000,
        },
      },
    })
  );

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'Performance Optimization',
        description: 'Improve application performance and reduce load times',
        status: InitiativeStatus.COMPLETE,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        domainComplexity: 'LOW',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        portfolioAreaId: portfolioAreas['Platform Engineering'].id,
        orgNodeId: paIdToOrgNodeId[portfolioAreas['Platform Engineering'].id] || null,
        customFields: {
          tags: ['performance', 'optimization'],
          budget: 50000,
        },
      },
    })
  );

  console.log(`Created ${initiatives.length} initiatives`);

  // ============================================================================
  // SCOPE ITEMS
  // ============================================================================

  await prisma.scopeItem.create({
    data: {
      initiativeId: initiatives[0].id,
      name: 'Design new UI components',
      description: 'Create modern, accessible UI component library',
      skillDemand: { design: 2, frontend: 3 },
      estimateP50: 160,
      estimateP90: 200,
    },
  });

  await prisma.scopeItem.create({
    data: {
      initiativeId: initiatives[0].id,
      name: 'Implement responsive layouts',
      description: 'Build responsive layouts for all screen sizes',
      skillDemand: { frontend: 4 },
      estimateP50: 120,
      estimateP90: 160,
    },
  });

  await prisma.scopeItem.create({
    data: {
      initiativeId: initiatives[1].id,
      name: 'Setup new API gateway',
      description: 'Configure and deploy new API gateway infrastructure',
      skillDemand: { backend: 3, devops: 2 },
      estimateP50: 200,
      estimateP90: 280,
    },
  });

  console.log('Created scope items');

  // ============================================================================
  // SCENARIOS & ALLOCATIONS
  // ============================================================================

  const scenario = await prisma.scenario.create({
    data: {
      name: 'Q1 2026 Planning',
      periodId: q1Period.id,
      status: ScenarioStatus.DRAFT,
      scenarioType: ScenarioType.BASELINE,
      assumptions: {
        allocationCapPercentage: 100,
        bufferPercentage: 20,
        proficiencyWeightEnabled: true,
        includeContractors: true,
        rampEnabled: true,
      },
      priorityRankings: [
        { initiativeId: initiatives[4].id, rank: 1 }, // Security Audit
        { initiativeId: initiatives[0].id, rank: 2 }, // Customer Portal
        { initiativeId: initiatives[1].id, rank: 3 }, // API Gateway
      ],
    },
  });

  console.log('Created scenario');

  // Create allocations
  await prisma.allocation.create({
    data: {
      scenarioId: scenario.id,
      employeeId: employees[0].id,
      initiativeId: initiatives[0].id,
      allocationType: AllocationType.PROJECT,
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-03-27'),
      percentage: 80,
    },
  });

  await prisma.allocation.create({
    data: {
      scenarioId: scenario.id,
      employeeId: employees[1].id,
      initiativeId: initiatives[1].id,
      allocationType: AllocationType.PROJECT,
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-03-27'),
      percentage: 100,
    },
  });

  await prisma.allocation.create({
    data: {
      scenarioId: scenario.id,
      employeeId: employees[2].id,
      initiativeId: initiatives[4].id,
      allocationType: AllocationType.PROJECT,
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-02-27'),
      percentage: 100,
    },
  });

  console.log('Created allocations');

  // ============================================================================
  // DOMAIN FAMILIARITY
  // ============================================================================

  await prisma.employeeDomainFamiliarity.createMany({
    data: [
      { employeeId: employees[0].id, initiativeId: initiatives[0].id, familiarityLevel: 0.8, source: 'MANUAL' },
      { employeeId: employees[1].id, initiativeId: initiatives[1].id, familiarityLevel: 0.3, source: 'MANUAL' },
      { employeeId: employees[2].id, initiativeId: initiatives[4].id, familiarityLevel: 0.0, source: 'MANUAL' },
    ],
  });
  console.log('Created domain familiarity entries');

  // ============================================================================
  // DEFAULT DRIFT THRESHOLD
  // ============================================================================

  const existingThresholds = await prisma.driftThreshold.count();
  if (existingThresholds === 0) {
    await prisma.driftThreshold.create({
      data: {
        capacityThresholdPct: 5.0,
        demandThresholdPct: 10.0,
        isGlobal: true,
      },
    });
    console.log('Created default drift threshold');
  }

  console.log('\nTest data seeded successfully!');
  console.log('\nTest Users:');
  console.log('  Admin:   admin@productfolio.test / Admin123!');
  console.log('  Planner: planner@productfolio.test / Planner123!');
  console.log('  Viewer:  viewer@productfolio.test / Viewer123!');
}

main()
  .catch((e) => {
    console.error('Error seeding test data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
