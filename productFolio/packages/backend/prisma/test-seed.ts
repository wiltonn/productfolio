/**
 * Test Seed Script
 *
 * Seeds the database with test data for E2E tests and development.
 * Run with: npm run db:seed:test
 */

import { PrismaClient, UserRole, InitiativeStatus, EmploymentType } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding test data...');

  // Create test users
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
  console.log('✓ Created admin user');

  const plannerUser = await prisma.user.upsert({
    where: { email: 'planner@productfolio.test' },
    update: {},
    create: {
      email: 'planner@productfolio.test',
      name: 'Test Planner',
      passwordHash: await argon2.hash('Planner123!'),
      role: UserRole.PLANNER,
    },
  });
  console.log('✓ Created planner user');

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
  console.log('✓ Created viewer user');

  // Create employees with various skills
  const employees = [];

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Alice Johnson',
        email: 'alice@productfolio.test',
        role: 'Senior Frontend Engineer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: { frontend: 5, react: 5, typescript: 4 },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Bob Smith',
        email: 'bob@productfolio.test',
        role: 'Backend Engineer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: { backend: 5, nodejs: 4, python: 3 },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Carol Davis',
        email: 'carol@productfolio.test',
        role: 'Full Stack Engineer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: { frontend: 4, backend: 4, devops: 3 },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'David Lee',
        email: 'david@productfolio.test',
        role: 'Product Designer',
        employmentType: EmploymentType.FULL_TIME,
        hoursPerWeek: 40,
        skills: { design: 5, ux: 5, frontend: 2 },
      },
    })
  );

  employees.push(
    await prisma.employee.create({
      data: {
        name: 'Eve Martinez',
        email: 'eve@productfolio.test',
        role: 'DevOps Engineer',
        employmentType: EmploymentType.CONTRACTOR,
        hoursPerWeek: 32,
        skills: { devops: 5, infrastructure: 4, security: 3 },
      },
    })
  );

  console.log(`✓ Created ${employees.length} employees`);

  // Create sample initiatives
  const initiatives = [];

  initiatives.push(
    await prisma.initiative.create({
      data: {
        title: 'Customer Portal Redesign',
        description: 'Modernize the customer portal with improved UX and performance',
        status: InitiativeStatus.IN_PROGRESS,
        targetQuarter: '2024-Q2',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
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
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2024-Q2',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
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
        status: InitiativeStatus.PENDING_APPROVAL,
        targetQuarter: '2024-Q3',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
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
        status: InitiativeStatus.DRAFT,
        targetQuarter: '2024-Q3',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
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
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2024-Q2',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
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
        status: InitiativeStatus.COMPLETED,
        targetQuarter: '2024-Q1',
        businessOwnerId: adminUser.id,
        productOwnerId: plannerUser.id,
        customFields: {
          tags: ['performance', 'optimization'],
          budget: 50000,
        },
      },
    })
  );

  console.log(`✓ Created ${initiatives.length} initiatives`);

  // Add scope items to some initiatives
  await prisma.scopeItem.create({
    data: {
      initiativeId: initiatives[0].id,
      name: 'Design new UI components',
      description: 'Create modern, accessible UI component library',
      skillDemand: { design: 2, frontend: 3 },
      estimateP50: 160,
      estimateP90: 200,
      quarterDistribution: { '2024-Q2': 1.0 },
      approvalStatus: 'APPROVED',
      version: 1,
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
      quarterDistribution: { '2024-Q2': 1.0 },
      approvalStatus: 'APPROVED',
      version: 1,
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
      quarterDistribution: { '2024-Q2': 0.7, '2024-Q3': 0.3 },
      approvalStatus: 'APPROVED',
      version: 1,
    },
  });

  console.log('✓ Created scope items');

  // Create test scenarios
  const scenario = await prisma.scenario.create({
    data: {
      name: 'Q2 2024 Planning',
      quarterRange: '2024-Q2:2024-Q3',
      assumptions: {
        averageVelocity: 40,
        bufferPercentage: 20,
      },
      priorityRankings: [
        { initiativeId: initiatives[4].id, rank: 1 }, // Security Audit
        { initiativeId: initiatives[0].id, rank: 2 }, // Customer Portal
        { initiativeId: initiatives[1].id, rank: 3 }, // API Gateway
      ],
    },
  });

  console.log('✓ Created scenario');

  // Create sample allocations
  await prisma.allocation.create({
    data: {
      scenarioId: scenario.id,
      employeeId: employees[0].id,
      initiativeId: initiatives[0].id,
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-06-30'),
      percentage: 80,
    },
  });

  await prisma.allocation.create({
    data: {
      scenarioId: scenario.id,
      employeeId: employees[1].id,
      initiativeId: initiatives[1].id,
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-06-30'),
      percentage: 100,
    },
  });

  await prisma.allocation.create({
    data: {
      scenarioId: scenario.id,
      employeeId: employees[2].id,
      initiativeId: initiatives[4].id,
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-05-31'),
      percentage: 100,
    },
  });

  console.log('✓ Created allocations');

  console.log('\n✅ Test data seeded successfully!');
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
