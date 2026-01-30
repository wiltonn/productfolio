import { PrismaClient, UserRole, InitiativeStatus, EmploymentType, PeriodType, ScenarioStatus, ScenarioType, AllocationType } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ============================================================================
  // USERS
  // ============================================================================

  const adminEmail = 'admin@example.com';
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await hashPassword('AdminPassword123');
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Admin User',
        role: UserRole.ADMIN,
        passwordHash,
      },
    });
    console.log(`Created admin user: ${admin.email}`);
  }

  const poEmail = 'product.owner@example.com';
  let productOwner = await prisma.user.findUnique({ where: { email: poEmail } });
  if (!productOwner) {
    const passwordHash = await hashPassword('ProductOwner123');
    productOwner = await prisma.user.create({
      data: {
        email: poEmail,
        name: 'Product Owner',
        role: UserRole.PRODUCT_OWNER,
        passwordHash,
      },
    });
    console.log(`Created product owner: ${productOwner.email}`);
  }

  const boEmail = 'business.owner@example.com';
  let businessOwner = await prisma.user.findUnique({ where: { email: boEmail } });
  if (!businessOwner) {
    const passwordHash = await hashPassword('BusinessOwner123');
    businessOwner = await prisma.user.create({
      data: {
        email: boEmail,
        name: 'Business Owner',
        role: UserRole.BUSINESS_OWNER,
        passwordHash,
      },
    });
    console.log(`Created business owner: ${businessOwner.email}`);
  }

  // ============================================================================
  // PERIODS
  // ============================================================================

  // Create Q1 2026 and Q2 2026 quarter periods if not existing
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
    console.log(`Created period: ${q1Period.label}`);
  }

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
    console.log(`Created period: ${q2Period.label}`);
  }

  // ============================================================================
  // EMPLOYEES
  // ============================================================================

  const existingEmployees = await prisma.employee.count();
  let employees: Awaited<ReturnType<typeof prisma.employee.findMany>> = [];

  if (existingEmployees === 0) {
    console.log('Creating employees...');

    const employeesData = [
      { name: 'Sarah Chen', role: 'Senior Frontend Engineer', skills: ['Frontend', 'React', 'TypeScript'], hoursPerWeek: 40 },
      { name: 'Mike Johnson', role: 'Backend Engineer', skills: ['Backend', 'Go', 'PostgreSQL'], hoursPerWeek: 40 },
      { name: 'Alex Rivera', role: 'Full Stack Developer', skills: ['Frontend', 'Backend', 'React', 'Python'], hoursPerWeek: 40 },
      { name: 'Emily Watson', role: 'Data Engineer', skills: ['Data', 'Python', 'PostgreSQL', 'AWS'], hoursPerWeek: 40 },
      { name: 'Priya Patel', role: 'DevOps Engineer', skills: ['DevOps', 'AWS', 'Docker', 'Kubernetes'], hoursPerWeek: 40 },
      { name: 'James Lee', role: 'Senior Backend Engineer', skills: ['Backend', 'Go', 'Redis', 'PostgreSQL'], hoursPerWeek: 40 },
      { name: 'Maria Garcia', role: 'UX Designer', skills: ['Design', 'Figma', 'Research'], hoursPerWeek: 40 },
      { name: 'David Kim', role: 'Frontend Engineer', skills: ['Frontend', 'React', 'TypeScript', 'CSS'], hoursPerWeek: 40 },
      { name: 'Lisa Thompson', role: 'Product Manager', skills: ['Product', 'Strategy', 'Analytics'], hoursPerWeek: 40 },
      { name: 'Ryan Martinez', role: 'Security Engineer', skills: ['Security', 'Backend', 'DevOps'], hoursPerWeek: 32 },
    ];

    for (const empData of employeesData) {
      const employee = await prisma.employee.create({
        data: {
          name: empData.name,
          role: empData.role,
          employmentType: EmploymentType.FULL_TIME,
          hoursPerWeek: empData.hoursPerWeek,
          activeStart: new Date(),
        },
      });

      for (const skillName of empData.skills) {
        await prisma.skill.create({
          data: {
            employeeId: employee.id,
            name: skillName,
            proficiency: 3 + Math.floor(Math.random() * 2),
          },
        });
      }

      // Create capacity calendar entries for Q1 and Q2
      await prisma.capacityCalendar.createMany({
        data: [
          { employeeId: employee.id, periodId: q1Period.id, hoursAvailable: 0 },
          { employeeId: employee.id, periodId: q2Period.id, hoursAvailable: 0 },
        ],
      });

      console.log(`Created employee: ${employee.name}`);
    }

    employees = await prisma.employee.findMany();
  } else {
    console.log(`Employees already exist (${existingEmployees}), skipping...`);
    employees = await prisma.employee.findMany();
  }

  // ============================================================================
  // INITIATIVES
  // ============================================================================

  const existingInitiatives = await prisma.initiative.count();
  let initiatives: Awaited<ReturnType<typeof prisma.initiative.findMany>> = [];

  if (existingInitiatives <= 1) {
    console.log('Creating initiatives...');

    const initiativesData = [
      {
        title: 'Customer Portal Redesign',
        description: 'Complete redesign of the customer-facing portal with improved UX and performance',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'ON_TRACK' as const,
        scopeItems: [
          { name: 'Frontend Development', skillDemand: { Frontend: 280, TypeScript: 200 }, estimateP50: 280, estimateP90: 350 },
          { name: 'Backend API Updates', skillDemand: { Backend: 160, Go: 120 }, estimateP50: 160, estimateP90: 200 },
          { name: 'UX Design', skillDemand: { Design: 80 }, estimateP50: 80, estimateP90: 100 },
        ],
      },
      {
        title: 'API Gateway Migration',
        description: 'Migrate existing API infrastructure to new gateway architecture',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'AT_RISK' as const,
        scopeItems: [
          { name: 'Gateway Setup', skillDemand: { Backend: 200, DevOps: 80 }, estimateP50: 280, estimateP90: 350 },
          { name: 'Migration Scripts', skillDemand: { Backend: 120 }, estimateP50: 120, estimateP90: 160 },
        ],
      },
      {
        title: 'Mobile App v2',
        description: 'Major update to mobile application with new features',
        status: InitiativeStatus.IN_EXECUTION,
        targetQuarter: '2026-Q2',
        targetPeriodId: q2Period.id,
        deliveryHealth: 'ON_TRACK' as const,
        scopeItems: [
          { name: 'Mobile Frontend', skillDemand: { Frontend: 360, React: 300 }, estimateP50: 360, estimateP90: 450 },
          { name: 'API Integration', skillDemand: { Backend: 200 }, estimateP50: 200, estimateP90: 250 },
          { name: 'Design System', skillDemand: { Design: 120 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
      {
        title: 'Data Pipeline Optimization',
        description: 'Optimize data pipelines for improved throughput and reliability',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'DELAYED' as const,
        scopeItems: [
          { name: 'Pipeline Redesign', skillDemand: { Data: 120, Python: 100 }, estimateP50: 200, estimateP90: 250 },
          { name: 'Performance Tuning', skillDemand: { Backend: 120, PostgreSQL: 80 }, estimateP50: 120, estimateP90: 160 },
        ],
      },
      {
        title: 'Security Audit Implementation',
        description: 'Implement findings from security audit',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'ON_TRACK' as const,
        scopeItems: [
          { name: 'Security Fixes', skillDemand: { Security: 40, Backend: 80 }, estimateP50: 120, estimateP90: 160 },
          { name: 'Infrastructure Hardening', skillDemand: { DevOps: 80, Security: 40 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
      {
        title: 'Notification System',
        description: 'Centralized notification system for all channels',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        targetPeriodId: q1Period.id,
        deliveryHealth: 'ON_TRACK' as const,
        scopeItems: [
          { name: 'Backend Service', skillDemand: { Backend: 160, Go: 120 }, estimateP50: 160, estimateP90: 200 },
          { name: 'Frontend Integration', skillDemand: { Frontend: 120, React: 100 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
    ];

    for (const initData of initiativesData) {
      const initiative = await prisma.initiative.create({
        data: {
          title: initData.title,
          description: initData.description,
          status: initData.status,
          targetQuarter: initData.targetQuarter,
          targetPeriodId: initData.targetPeriodId,
          deliveryHealth: initData.deliveryHealth,
          businessOwnerId: businessOwner.id,
          productOwnerId: productOwner.id,
        },
      });

      for (const scopeData of initData.scopeItems) {
        await prisma.scopeItem.create({
          data: {
            initiativeId: initiative.id,
            name: scopeData.name,
            skillDemand: scopeData.skillDemand,
            estimateP50: scopeData.estimateP50,
            estimateP90: scopeData.estimateP90,
          },
        });
      }
      console.log(`Created initiative: ${initiative.title}`);
    }

    initiatives = await prisma.initiative.findMany({
      where: { status: { in: [InitiativeStatus.RESOURCING, InitiativeStatus.IN_EXECUTION] } },
    });
  } else {
    console.log(`Initiatives already exist (${existingInitiatives}), skipping...`);
    initiatives = await prisma.initiative.findMany({
      where: { status: { in: [InitiativeStatus.RESOURCING, InitiativeStatus.IN_EXECUTION] } },
    });
  }

  // ============================================================================
  // SCENARIOS & ALLOCATIONS
  // ============================================================================

  const existingScenarios = await prisma.scenario.count();
  if (existingScenarios === 0) {
    console.log('Creating scenarios...');

    const findEmployee = (name: string) => employees.find(e => e.name === name);
    const findInitiative = (title: string) => initiatives.find(i => i.title === title);

    // Create Q1 2026 Baseline Scenario
    const baselineScenario = await prisma.scenario.create({
      data: {
        name: 'Q1 2026 Baseline Plan',
        periodId: q1Period.id,
        status: ScenarioStatus.DRAFT,
        scenarioType: ScenarioType.BASELINE,
        assumptions: {
          allocationCapPercentage: 100,
          bufferPercentage: 10,
          proficiencyWeightEnabled: true,
          includeContractors: true,
        },
        priorityRankings: initiatives
          .filter(i => i.targetPeriodId === q1Period.id)
          .map((init, idx) => ({
            initiativeId: init.id,
            rank: idx + 1,
          })),
      },
    });
    console.log(`Created BASELINE scenario: ${baselineScenario.name}`);

    // Create allocations for Q1 baseline
    const q1Allocations = [
      { employeeName: 'Sarah Chen', initiativeTitle: 'Customer Portal Redesign', percentage: 80 },
      { employeeName: 'Sarah Chen', initiativeTitle: 'Notification System', percentage: 20 },
      { employeeName: 'Mike Johnson', initiativeTitle: 'API Gateway Migration', percentage: 100 },
      { employeeName: 'Alex Rivera', initiativeTitle: 'Customer Portal Redesign', percentage: 60 },
      { employeeName: 'Alex Rivera', initiativeTitle: 'Notification System', percentage: 40 },
      { employeeName: 'Emily Watson', initiativeTitle: 'Data Pipeline Optimization', percentage: 100 },
      { employeeName: 'Priya Patel', initiativeTitle: 'API Gateway Migration', percentage: 50 },
      { employeeName: 'Priya Patel', initiativeTitle: 'Security Audit Implementation', percentage: 50 },
      { employeeName: 'James Lee', initiativeTitle: 'Notification System', percentage: 60 },
      { employeeName: 'James Lee', initiativeTitle: 'API Gateway Migration', percentage: 40 },
      { employeeName: 'Maria Garcia', initiativeTitle: 'Customer Portal Redesign', percentage: 100 },
      { employeeName: 'David Kim', initiativeTitle: 'Customer Portal Redesign', percentage: 80 },
      { employeeName: 'David Kim', initiativeTitle: 'Notification System', percentage: 20 },
      { employeeName: 'Ryan Martinez', initiativeTitle: 'Security Audit Implementation', percentage: 100 },
    ];

    let allocCount = 0;
    for (const allocData of q1Allocations) {
      const employee = findEmployee(allocData.employeeName);
      const initiative = findInitiative(allocData.initiativeTitle);

      if (employee && initiative) {
        await prisma.allocation.create({
          data: {
            scenarioId: baselineScenario.id,
            employeeId: employee.id,
            initiativeId: initiative.id,
            allocationType: AllocationType.PROJECT,
            startDate: new Date('2026-01-05'),
            endDate: new Date('2026-03-27'),
            percentage: allocData.percentage,
          },
        });
        allocCount++;
      }
    }
    console.log(`Created ${allocCount} allocations for Q1 baseline`);

    // Create a WHAT_IF comparison scenario
    const whatIfScenario = await prisma.scenario.create({
      data: {
        name: 'Q1 2026 Conservative',
        periodId: q1Period.id,
        status: ScenarioStatus.DRAFT,
        scenarioType: ScenarioType.WHAT_IF,
        assumptions: {
          allocationCapPercentage: 80,
          bufferPercentage: 20,
          proficiencyWeightEnabled: true,
          includeContractors: false,
        },
        priorityRankings: initiatives
          .filter(i => i.targetPeriodId === q1Period.id)
          .slice(0, 3)
          .map((init, idx) => ({
            initiativeId: init.id,
            rank: idx + 1,
          })),
      },
    });
    console.log(`Created WHAT_IF scenario: ${whatIfScenario.name}`);

  } else {
    console.log(`Scenarios already exist (${existingScenarios}), skipping...`);
  }

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
    console.log('Created default global drift threshold (5% capacity, 10% demand)');
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
