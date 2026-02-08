import { PrismaClient, UserRole, InitiativeStatus, EmploymentType, PeriodType, ScenarioStatus, ScenarioType, AllocationType, OrgNodeType } from '@prisma/client';
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
      // ~13 weeks in a quarter
      const quarterlyHours = empData.hoursPerWeek * 13;
      await prisma.capacityCalendar.createMany({
        data: [
          { employeeId: employee.id, periodId: q1Period.id, hoursAvailable: quarterlyHours },
          { employeeId: employee.id, periodId: q2Period.id, hoursAvailable: quarterlyHours },
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
  // PORTFOLIO AREAS
  // ============================================================================

  const portfolioAreaNames = ['Customer Experience', 'Platform Engineering', 'Data & Analytics', 'Security & Compliance'];
  const portfolioAreas: Record<string, Awaited<ReturnType<typeof prisma.portfolioArea.create>>> = {};

  for (const name of portfolioAreaNames) {
    let area = await prisma.portfolioArea.findUnique({ where: { name } });
    if (!area) {
      area = await prisma.portfolioArea.create({ data: { name } });
      console.log(`Created portfolio area: ${area.name}`);
    }
    portfolioAreas[name] = area;
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
        domainComplexity: 'MEDIUM' as const,
        portfolioAreaId: portfolioAreas['Customer Experience'].id,
        productLeaderId: productOwner.id,
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
        domainComplexity: 'HIGH' as const,
        portfolioAreaId: portfolioAreas['Platform Engineering'].id,
        productLeaderId: admin.id,
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
        domainComplexity: 'MEDIUM' as const,
        portfolioAreaId: portfolioAreas['Customer Experience'].id,
        productLeaderId: productOwner.id,
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
        domainComplexity: 'VERY_HIGH' as const,
        portfolioAreaId: portfolioAreas['Data & Analytics'].id,
        productLeaderId: businessOwner.id,
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
        domainComplexity: 'HIGH' as const,
        portfolioAreaId: portfolioAreas['Security & Compliance'].id,
        productLeaderId: admin.id,
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
        domainComplexity: 'LOW' as const,
        portfolioAreaId: portfolioAreas['Platform Engineering'].id,
        productLeaderId: productOwner.id,
        scopeItems: [
          { name: 'Backend Service', skillDemand: { Backend: 160, Go: 120 }, estimateP50: 160, estimateP90: 200 },
          { name: 'Frontend Integration', skillDemand: { Frontend: 120, React: 100 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
    ];

    // Build a mapping from portfolioAreaId → orgNodeId
    const paIdToOrgNodeId: Record<string, string> = {};
    for (const [paName, paRecord] of Object.entries(portfolioAreas)) {
      if (portfolioAreaOrgNodes[paName]) {
        paIdToOrgNodeId[paRecord.id] = portfolioAreaOrgNodes[paName].id;
      }
    }

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
          portfolioAreaId: initData.portfolioAreaId,
          orgNodeId: paIdToOrgNodeId[initData.portfolioAreaId] || null,
          productLeaderId: initData.productLeaderId,
          domainComplexity: initData.domainComplexity,
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
          rampEnabled: true,
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

    // Create domain familiarity entries for allocated employees
    const findEmployeeForFamiliarity = (name: string) => employees.find(e => e.name === name);
    const findInitiativeForFamiliarity = (title: string) => initiatives.find(i => i.title === title);

    const familiarityData = [
      { employeeName: 'Sarah Chen', initiativeTitle: 'Customer Portal Redesign', level: 0.9 },
      { employeeName: 'Mike Johnson', initiativeTitle: 'API Gateway Migration', level: 0.4 },
      { employeeName: 'Alex Rivera', initiativeTitle: 'Customer Portal Redesign', level: 0.6 },
      { employeeName: 'Alex Rivera', initiativeTitle: 'Notification System', level: 0.0 },
      { employeeName: 'Emily Watson', initiativeTitle: 'Data Pipeline Optimization', level: 1.0 },
      { employeeName: 'Priya Patel', initiativeTitle: 'API Gateway Migration', level: 0.3 },
      { employeeName: 'Priya Patel', initiativeTitle: 'Security Audit Implementation', level: 0.2 },
      { employeeName: 'James Lee', initiativeTitle: 'Notification System', level: 0.0 },
      { employeeName: 'Maria Garcia', initiativeTitle: 'Customer Portal Redesign', level: 0.7 },
      { employeeName: 'David Kim', initiativeTitle: 'Customer Portal Redesign', level: 0.5 },
      { employeeName: 'Ryan Martinez', initiativeTitle: 'Security Audit Implementation', level: 0.8 },
    ];

    let famCount = 0;
    for (const fam of familiarityData) {
      const emp = findEmployeeForFamiliarity(fam.employeeName);
      const init = findInitiativeForFamiliarity(fam.initiativeTitle);
      if (emp && init) {
        await prisma.employeeDomainFamiliarity.create({
          data: {
            employeeId: emp.id,
            initiativeId: init.id,
            familiarityLevel: fam.level,
            source: 'MANUAL',
          },
        });
        famCount++;
      }
    }
    console.log(`Created ${famCount} domain familiarity entries`);

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
          rampEnabled: false,
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

  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================

  const featureFlags = [
    { key: 'org_capacity_view', description: 'Enable the Org Capacity page for org-scoped supply/demand views' },
    { key: 'job_profiles', description: 'Enable Job Profiles management and employee assignment' },
    { key: 'flow_forecast_v1', description: 'Enable Flow Forecast page (Mode A: scope-based forecasting)' },
    { key: 'forecast_mode_b', description: 'Enable Mode B: empirical forecasting based on historical throughput' },
    { key: 'token_planning_v1', description: 'Enable Token+Flow planning mode for scenarios' },
    { key: 'approval_enforcement_v1', description: 'Enable approval policy enforcement (BLOCKING/ADVISORY) on operations' },
  ];

  for (const flag of featureFlags) {
    const existing = await prisma.featureFlag.findUnique({ where: { key: flag.key } });
    if (!existing) {
      await prisma.featureFlag.create({
        data: {
          key: flag.key,
          enabled: false,
          description: flag.description,
        },
      });
      console.log(`Created feature flag: ${flag.key} (disabled)`);
    }
  }

  // ============================================================================
  // SKILL POOLS
  // ============================================================================

  const skillPoolData = [
    { name: 'backend', description: 'Backend development capacity' },
    { name: 'frontend', description: 'Frontend development capacity' },
    { name: 'data', description: 'Data engineering and analytics capacity' },
    { name: 'qa', description: 'Quality assurance and testing capacity' },
    { name: 'domain', description: 'Domain expertise and product knowledge' },
  ];

  const skillPools: Record<string, Awaited<ReturnType<typeof prisma.skillPool.upsert>>> = {};
  for (const pool of skillPoolData) {
    const sp = await prisma.skillPool.upsert({
      where: { name: pool.name },
      update: {},
      create: pool,
    });
    skillPools[pool.name] = sp;
    console.log(`Upserted skill pool: ${pool.name}`);
  }

  // ============================================================================
  // TOKEN CALIBRATIONS
  // ============================================================================

  const calibrationData = [
    { pool: 'backend', tokenPerHour: 1.0 },
    { pool: 'frontend', tokenPerHour: 1.2 },
    { pool: 'data', tokenPerHour: 0.8 },
    { pool: 'qa', tokenPerHour: 1.5 },
    { pool: 'domain', tokenPerHour: 0.5 },
  ];

  for (const cal of calibrationData) {
    const poolId = skillPools[cal.pool].id;
    const effectiveDate = new Date('2026-01-01');
    await prisma.tokenCalibration.upsert({
      where: { skillPoolId_effectiveDate: { skillPoolId: poolId, effectiveDate } },
      update: {},
      create: {
        skillPoolId: poolId,
        tokenPerHour: cal.tokenPerHour,
        effectiveDate,
        notes: `Default calibration for ${cal.pool}`,
      },
    });
    console.log(`Upserted token calibration: ${cal.pool} → ${cal.tokenPerHour} tok/hr`);
  }

  // ============================================================================
  // TOKEN-MODE SCENARIO (with supply & demand data)
  // ============================================================================

  const existingTokenScenario = await prisma.scenario.findFirst({
    where: { name: 'Q1 2026 Token Flow Plan' },
  });

  if (!existingTokenScenario) {
    const tokenScenario = await prisma.scenario.create({
      data: {
        name: 'Q1 2026 Token Flow Plan',
        periodId: q1Period.id,
        status: ScenarioStatus.DRAFT,
        scenarioType: ScenarioType.WHAT_IF,
        planningMode: 'TOKEN',
        assumptions: {
          allocationCapPercentage: 100,
          bufferPercentage: 10,
        },
        priorityRankings: initiatives
          .filter(i => i.targetPeriodId === q1Period.id)
          .map((init, idx) => ({ initiativeId: init.id, rank: idx + 1 })),
      },
    });
    console.log(`Created TOKEN scenario: ${tokenScenario.name}`);

    // Seed token supply for each skill pool
    const supplyData = [
      { pool: 'backend', tokens: 200 },
      { pool: 'frontend', tokens: 150 },
      { pool: 'data', tokens: 80 },
      { pool: 'qa', tokens: 60 },
      { pool: 'domain', tokens: 40 },
    ];

    for (const s of supplyData) {
      await prisma.tokenSupply.create({
        data: {
          scenarioId: tokenScenario.id,
          skillPoolId: skillPools[s.pool].id,
          tokens: s.tokens,
          notes: `Q1 capacity for ${s.pool}`,
        },
      });
    }
    console.log(`Created ${supplyData.length} token supply entries`);

    // Seed token demand from Q1 initiatives
    const q1Initiatives = initiatives.filter(i => i.targetPeriodId === q1Period.id);
    const demandMap: Record<string, { pool: string; tokensP50: number; tokensP90: number }[]> = {
      'Customer Portal Redesign': [
        { pool: 'frontend', tokensP50: 80, tokensP90: 100 },
        { pool: 'backend', tokensP50: 45, tokensP90: 56 },
        { pool: 'domain', tokensP50: 20, tokensP90: 25 },
      ],
      'API Gateway Migration': [
        { pool: 'backend', tokensP50: 70, tokensP90: 88 },
        { pool: 'qa', tokensP50: 20, tokensP90: 28 },
      ],
      'Data Pipeline Optimization': [
        { pool: 'data', tokensP50: 60, tokensP90: 75 },
        { pool: 'backend', tokensP50: 35, tokensP90: 44 },
      ],
      'Security Audit Implementation': [
        { pool: 'backend', tokensP50: 30, tokensP90: 40 },
        { pool: 'qa', tokensP50: 25, tokensP90: 32 },
      ],
      'Notification System': [
        { pool: 'backend', tokensP50: 45, tokensP90: 56 },
        { pool: 'frontend', tokensP50: 35, tokensP90: 44 },
      ],
    };

    let demandCount = 0;
    for (const init of q1Initiatives) {
      const demands = demandMap[init.title];
      if (!demands) continue;
      for (const d of demands) {
        await prisma.tokenDemand.create({
          data: {
            scenarioId: tokenScenario.id,
            initiativeId: init.id,
            skillPoolId: skillPools[d.pool].id,
            tokensP50: d.tokensP50,
            tokensP90: d.tokensP90,
            notes: `${init.title} → ${d.pool}`,
          },
        });
        demandCount++;
      }
    }
    console.log(`Created ${demandCount} token demand entries`);
  } else {
    console.log('Token Flow scenario already exists, skipping...');
  }

  // ============================================================================
  // ORG TREE + MEMBERSHIPS
  // ============================================================================

  // Look up or create the Engineering division (the main node we need for capacity)
  let engNode = await prisma.orgNode.findFirst({ where: { code: 'ENG' } });
  if (!engNode) {
    // No org tree at all — create one
    console.log('Creating org tree...');
    const root = await prisma.orgNode.create({
      data: { name: 'ProductFolio Corp', code: 'PF', type: OrgNodeType.ROOT, path: '/PF', depth: 0, sortOrder: 0 },
    });
    engNode = await prisma.orgNode.create({
      data: { name: 'Engineering', code: 'ENG', type: OrgNodeType.DIVISION, parentId: root.id, path: '/PF/ENG', depth: 1, sortOrder: 0 },
    });
    await prisma.orgNode.create({
      data: { name: 'Product', code: 'PROD', type: OrgNodeType.DIVISION, parentId: root.id, path: '/PF/PROD', depth: 1, sortOrder: 1 },
    });
    console.log('Created root org tree');
  }

  // Ensure sub-teams exist under Engineering
  const ensureTeam = async (name: string, code: string, sortOrder: number) => {
    let node = await prisma.orgNode.findFirst({ where: { code } });
    if (!node) {
      node = await prisma.orgNode.create({
        data: { name, code, type: OrgNodeType.TEAM, parentId: engNode!.id, path: `${engNode!.path}/${code}`, depth: engNode!.depth + 1, sortOrder },
      });
      console.log(`Created team: ${name}`);
    }
    return node;
  };

  // Create portfolio-area OrgNodes under ROOT (mirrors the PortfolioArea records)
  const rootNode = await prisma.orgNode.findFirst({ where: { type: OrgNodeType.ROOT } });
  const portfolioAreaOrgNodes: Record<string, Awaited<ReturnType<typeof prisma.orgNode.create>>> = {};
  const paNodeDefs = [
    { name: 'Customer Experience', code: 'PA-CUST-EXP', sortOrder: 10 },
    { name: 'Platform Engineering', code: 'PA-PLAT-ENG', sortOrder: 11 },
    { name: 'Data & Analytics', code: 'PA-DATA-ANLY', sortOrder: 12 },
    { name: 'Security & Compliance', code: 'PA-SEC-COMP', sortOrder: 13 },
  ];
  for (const pa of paNodeDefs) {
    let node = await prisma.orgNode.findFirst({ where: { code: pa.code } });
    if (!node && rootNode) {
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
      console.log(`Created portfolio area org node: ${pa.name}`);
    }
    if (node) portfolioAreaOrgNodes[pa.name] = node;
  }

  const platformTeam = await ensureTeam('Platform Team', 'PLAT', 0);
  const frontendTeam = await ensureTeam('Frontend Team', 'FE', 1);
  const dataTeam = await ensureTeam('Data Team', 'DATA', 2);
  const prodNode = await prisma.orgNode.findFirst({ where: { code: 'PRD' } })
    ?? await prisma.orgNode.findFirst({ where: { code: 'PROD' } });

  // Seed memberships if none exist
  const existingMemberships = await prisma.orgMembership.count();
  if (existingMemberships === 0) {
    console.log('Creating org memberships...');

    const teamAssignments: { employeeName: string; teamId: string }[] = [
      { employeeName: 'Mike Johnson', teamId: platformTeam.id },
      { employeeName: 'James Lee', teamId: platformTeam.id },
      { employeeName: 'Priya Patel', teamId: platformTeam.id },
      { employeeName: 'Ryan Martinez', teamId: platformTeam.id },
      { employeeName: 'Sarah Chen', teamId: frontendTeam.id },
      { employeeName: 'David Kim', teamId: frontendTeam.id },
      { employeeName: 'Alex Rivera', teamId: frontendTeam.id },
      { employeeName: 'Maria Garcia', teamId: frontendTeam.id },
      { employeeName: 'Emily Watson', teamId: dataTeam.id },
      ...(prodNode ? [{ employeeName: 'Lisa Thompson', teamId: prodNode.id }] : []),
    ];

    let membershipCount = 0;
    for (const ta of teamAssignments) {
      const emp = employees.find(e => e.name === ta.employeeName);
      if (emp) {
        await prisma.orgMembership.create({
          data: { employeeId: emp.id, orgNodeId: ta.teamId },
        });
        membershipCount++;
      }
    }
    console.log(`Created ${membershipCount} org memberships`);
  } else {
    console.log(`Org memberships already exist (${existingMemberships}), skipping...`);
  }

  // ============================================================================
  // JOB PROFILES + COST BANDS
  // ============================================================================

  const existingProfiles = await prisma.jobProfile.count();
  if (existingProfiles === 0) {
    console.log('Creating job profiles...');

    const profilesData = [
      {
        name: 'Senior Frontend Engineer',
        level: 'L5',
        band: 'IC5',
        description: 'Leads frontend architecture and mentors junior engineers',
        skills: [{ skillName: 'Frontend', proficiency: 4 }, { skillName: 'React', proficiency: 4 }, { skillName: 'TypeScript', proficiency: 4 }],
        cost: { annualCostMin: 140000, annualCostMax: 180000, hourlyRate: 85 },
      },
      {
        name: 'Backend Engineer',
        level: 'L4',
        band: 'IC4',
        description: 'Designs and implements backend services and APIs',
        skills: [{ skillName: 'Backend', proficiency: 3 }, { skillName: 'Go', proficiency: 3 }, { skillName: 'PostgreSQL', proficiency: 3 }],
        cost: { annualCostMin: 110000, annualCostMax: 145000, hourlyRate: 70 },
      },
      {
        name: 'Senior Backend Engineer',
        level: 'L5',
        band: 'IC5',
        description: 'Owns backend platform components and drives technical decisions',
        skills: [{ skillName: 'Backend', proficiency: 4 }, { skillName: 'Go', proficiency: 4 }, { skillName: 'Redis', proficiency: 3 }, { skillName: 'PostgreSQL', proficiency: 4 }],
        cost: { annualCostMin: 140000, annualCostMax: 180000, hourlyRate: 85 },
      },
      {
        name: 'Full Stack Developer',
        level: 'L4',
        band: 'IC4',
        description: 'Works across the stack on features end-to-end',
        skills: [{ skillName: 'Frontend', proficiency: 3 }, { skillName: 'Backend', proficiency: 3 }, { skillName: 'React', proficiency: 3 }],
        cost: { annualCostMin: 115000, annualCostMax: 150000, hourlyRate: 72 },
      },
      {
        name: 'Data Engineer',
        level: 'L4',
        band: 'IC4',
        description: 'Builds and maintains data pipelines and analytics infrastructure',
        skills: [{ skillName: 'Data', proficiency: 4 }, { skillName: 'Python', proficiency: 3 }, { skillName: 'PostgreSQL', proficiency: 3 }],
        cost: { annualCostMin: 120000, annualCostMax: 155000, hourlyRate: 75 },
      },
      {
        name: 'DevOps Engineer',
        level: 'L4',
        band: 'IC4',
        description: 'Manages infrastructure, CI/CD, and cloud operations',
        skills: [{ skillName: 'DevOps', proficiency: 4 }, { skillName: 'AWS', proficiency: 3 }, { skillName: 'Docker', proficiency: 3 }],
        cost: { annualCostMin: 125000, annualCostMax: 160000, hourlyRate: 78 },
      },
      {
        name: 'UX Designer',
        level: 'L4',
        band: 'IC4',
        description: 'Designs user experiences and conducts user research',
        skills: [{ skillName: 'Design', proficiency: 4 }, { skillName: 'Figma', proficiency: 4 }, { skillName: 'Research', proficiency: 3 }],
        cost: { annualCostMin: 105000, annualCostMax: 140000, hourlyRate: 68 },
      },
      {
        name: 'Security Engineer',
        level: 'L4',
        band: 'IC4',
        description: 'Identifies vulnerabilities and implements security controls',
        skills: [{ skillName: 'Security', proficiency: 4 }, { skillName: 'Backend', proficiency: 3 }],
        cost: { annualCostMin: 130000, annualCostMax: 170000, hourlyRate: 82 },
      },
    ];

    for (const pd of profilesData) {
      const profile = await prisma.jobProfile.create({
        data: {
          name: pd.name,
          level: pd.level,
          band: pd.band,
          description: pd.description,
        },
      });

      for (const sk of pd.skills) {
        await prisma.jobProfileSkill.create({
          data: {
            jobProfileId: profile.id,
            skillName: sk.skillName,
            expectedProficiency: sk.proficiency,
          },
        });
      }

      await prisma.costBand.create({
        data: {
          jobProfileId: profile.id,
          annualCostMin: pd.cost.annualCostMin,
          annualCostMax: pd.cost.annualCostMax,
          hourlyRate: pd.cost.hourlyRate,
          currency: 'USD',
          effectiveDate: new Date('2026-01-01'),
        },
      });

      console.log(`Created job profile: ${pd.name} (${pd.level}/${pd.band})`);
    }

    // Assign job profiles to employees
    const profileAssignments: Record<string, string> = {
      'Sarah Chen': 'Senior Frontend Engineer',
      'Mike Johnson': 'Backend Engineer',
      'Alex Rivera': 'Full Stack Developer',
      'Emily Watson': 'Data Engineer',
      'Priya Patel': 'DevOps Engineer',
      'James Lee': 'Senior Backend Engineer',
      'Maria Garcia': 'UX Designer',
      'David Kim': 'Senior Frontend Engineer',
      'Ryan Martinez': 'Security Engineer',
    };

    const allProfiles = await prisma.jobProfile.findMany();
    for (const [empName, profileName] of Object.entries(profileAssignments)) {
      const emp = employees.find(e => e.name === empName);
      const prof = allProfiles.find(p => p.name === profileName);
      if (emp && prof) {
        await prisma.employee.update({
          where: { id: emp.id },
          data: { jobProfileId: prof.id },
        });
      }
    }
    console.log('Assigned job profiles to employees');
  } else {
    console.log(`Job profiles already exist (${existingProfiles}), skipping...`);
  }

  // ============================================================================
  // AUTHORITIES (Permission Registry)
  // ============================================================================

  const authorities = [
    { code: 'initiative:read', description: 'View initiatives and their details', category: 'initiative' },
    { code: 'initiative:write', description: 'Create, update, and delete initiatives', category: 'initiative' },
    { code: 'scenario:read', description: 'View scenarios and allocations', category: 'scenario' },
    { code: 'scenario:write', description: 'Create, update, and delete scenarios and allocations', category: 'scenario' },
    { code: 'employee:read', description: 'View employees and capacity', category: 'employee' },
    { code: 'employee:write', description: 'Create, update, and delete employees', category: 'employee' },
    { code: 'planning:read', description: 'View planning data (token ledger, supply, demand)', category: 'planning' },
    { code: 'planning:write', description: 'Modify planning mode, token supply, and demand', category: 'planning' },
    { code: 'forecast:read', description: 'View forecast runs and data quality', category: 'forecast' },
    { code: 'forecast:write', description: 'Run forecasts (scope-based and empirical)', category: 'forecast' },
    { code: 'org:read', description: 'View org tree and memberships', category: 'org' },
    { code: 'org:write', description: 'Manage org tree nodes and memberships', category: 'org' },
    { code: 'approval:read', description: 'View approval policies and requests', category: 'approval' },
    { code: 'approval:write', description: 'Manage approval policies and delegations', category: 'approval' },
    { code: 'drift:read', description: 'View drift alerts and thresholds', category: 'drift' },
    { code: 'drift:write', description: 'Acknowledge/resolve drift alerts, update thresholds', category: 'drift' },
    { code: 'job-profile:read', description: 'View job profiles and cost bands', category: 'job-profile' },
    { code: 'job-profile:write', description: 'Create, update, and delete job profiles', category: 'job-profile' },
    { code: 'feature-flag:admin', description: 'Manage feature flags', category: 'admin' },
    { code: 'jira:admin', description: 'Manage Jira integration settings', category: 'admin' },
    { code: 'authority:admin', description: 'Manage authority registry and view audit logs', category: 'admin' },
  ];

  for (const auth of authorities) {
    const existing = await prisma.authority.findUnique({ where: { code: auth.code } });
    if (!existing) {
      await prisma.authority.create({ data: auth });
      console.log(`Created authority: ${auth.code}`);
    }
  }

  // ============================================================================
  // TENANT CONFIG (Entitlement / Seat Licensing)
  // ============================================================================

  const existingTenantConfig = await prisma.tenantConfig.findFirst();
  if (!existingTenantConfig) {
    await prisma.tenantConfig.create({
      data: {
        tier: 'starter',
        seatLimit: 5,
      },
    });
    console.log('Created default tenant config (starter tier, 5 seat limit)');
  } else {
    console.log('Tenant config already exists, skipping...');
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
