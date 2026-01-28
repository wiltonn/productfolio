import { PrismaClient, UserRole, InitiativeStatus, EmploymentType } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ============================================================================
  // USERS
  // ============================================================================

  // Create admin user
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

  // Create product owner
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

  // Create business owner
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
  // EMPLOYEES
  // ============================================================================

  const existingEmployees = await prisma.employee.count();
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

      // Create skills for the employee
      for (let i = 0; i < empData.skills.length; i++) {
        await prisma.skill.create({
          data: {
            employeeId: employee.id,
            name: empData.skills[i],
            proficiency: 3 + Math.floor(Math.random() * 2), // 3-4 proficiency
          },
        });
      }
      console.log(`Created employee: ${employee.name}`);
    }
  } else {
    console.log(`Employees already exist (${existingEmployees}), skipping...`);
  }

  // ============================================================================
  // INITIATIVES
  // ============================================================================

  const existingInitiatives = await prisma.initiative.count();
  if (existingInitiatives <= 1) {
    console.log('Creating initiatives...');

    const initiativesData = [
      {
        title: 'Customer Portal Redesign',
        description: 'Complete redesign of the customer-facing portal with improved UX and performance',
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2026-Q1',
        scopeItems: [
          { name: 'Frontend Development', skillDemand: { Frontend: 280, TypeScript: 200 }, estimateP50: 280, estimateP90: 350 },
          { name: 'Backend API Updates', skillDemand: { Backend: 160, Go: 120 }, estimateP50: 160, estimateP90: 200 },
          { name: 'UX Design', skillDemand: { Design: 80 }, estimateP50: 80, estimateP90: 100 },
        ],
      },
      {
        title: 'API Gateway Migration',
        description: 'Migrate existing API infrastructure to new gateway architecture',
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2026-Q1',
        scopeItems: [
          { name: 'Gateway Setup', skillDemand: { Backend: 200, DevOps: 80 }, estimateP50: 280, estimateP90: 350 },
          { name: 'Migration Scripts', skillDemand: { Backend: 120 }, estimateP50: 120, estimateP90: 160 },
        ],
      },
      {
        title: 'Mobile App v2',
        description: 'Major update to mobile application with new features',
        status: InitiativeStatus.IN_PROGRESS,
        targetQuarter: '2026-Q2',
        scopeItems: [
          { name: 'Mobile Frontend', skillDemand: { Frontend: 360, React: 300 }, estimateP50: 360, estimateP90: 450 },
          { name: 'API Integration', skillDemand: { Backend: 200 }, estimateP50: 200, estimateP90: 250 },
          { name: 'Design System', skillDemand: { Design: 120 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
      {
        title: 'Data Pipeline Optimization',
        description: 'Optimize data pipelines for improved throughput and reliability',
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2026-Q1',
        scopeItems: [
          { name: 'Pipeline Redesign', skillDemand: { Data: 120, Python: 100 }, estimateP50: 200, estimateP90: 250 },
          { name: 'Performance Tuning', skillDemand: { Backend: 120, PostgreSQL: 80 }, estimateP50: 120, estimateP90: 160 },
        ],
      },
      {
        title: 'Analytics Dashboard',
        description: 'New analytics dashboard for business intelligence',
        status: InitiativeStatus.PENDING_APPROVAL,
        targetQuarter: '2026-Q2',
        scopeItems: [
          { name: 'Dashboard UI', skillDemand: { Frontend: 200, React: 180 }, estimateP50: 200, estimateP90: 260 },
          { name: 'Data Processing', skillDemand: { Data: 120, Python: 100 }, estimateP50: 120, estimateP90: 160 },
          { name: 'Visualization Design', skillDemand: { Design: 80 }, estimateP50: 80, estimateP90: 100 },
        ],
      },
      {
        title: 'Security Audit Implementation',
        description: 'Implement findings from security audit',
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2026-Q1',
        scopeItems: [
          { name: 'Security Fixes', skillDemand: { Security: 40, Backend: 80 }, estimateP50: 120, estimateP90: 160 },
          { name: 'Infrastructure Hardening', skillDemand: { DevOps: 80, Security: 40 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
      {
        title: 'Search Infrastructure',
        description: 'Build new search infrastructure using Elasticsearch',
        status: InitiativeStatus.DRAFT,
        targetQuarter: '2026-Q2',
        scopeItems: [
          { name: 'Search Service', skillDemand: { Backend: 320, Go: 240 }, estimateP50: 320, estimateP90: 400 },
          { name: 'Indexing Pipeline', skillDemand: { Data: 160, Python: 120 }, estimateP50: 160, estimateP90: 200 },
          { name: 'DevOps Setup', skillDemand: { DevOps: 80 }, estimateP50: 80, estimateP90: 100 },
        ],
      },
      {
        title: 'Notification System',
        description: 'Centralized notification system for all channels',
        status: InitiativeStatus.APPROVED,
        targetQuarter: '2026-Q1',
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
          businessOwnerId: businessOwner.id,
          productOwnerId: productOwner.id,
        },
      });

      // Create scope items
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
  } else {
    console.log(`Initiatives already exist (${existingInitiatives}), skipping...`);
  }

  // ============================================================================
  // SCENARIOS & ALLOCATIONS
  // ============================================================================

  const existingScenarios = await prisma.scenario.count();
  if (existingScenarios === 0) {
    console.log('Creating scenarios...');

    // Fetch employees and initiatives for allocations
    const employees = await prisma.employee.findMany();
    const initiatives = await prisma.initiative.findMany({
      where: { status: { in: [InitiativeStatus.APPROVED, InitiativeStatus.IN_PROGRESS] } },
    });

    // Create Q1 2026 Planning Scenario
    const q1Scenario = await prisma.scenario.create({
      data: {
        name: 'Q1 2026 Resource Plan',
        quarterRange: '2026-Q1:2026-Q2',
        assumptions: {
          allocationCapPercentage: 100,
          bufferPercentage: 10,
          proficiencyWeightEnabled: true,
          includeContractors: true,
          hoursPerQuarter: 520,
        },
        priorityRankings: initiatives.map((init, idx) => ({
          initiativeId: init.id,
          rank: idx + 1,
        })),
      },
    });
    console.log(`Created scenario: ${q1Scenario.name}`);

    // Create allocations for Q1 scenario
    const allocationsData = [
      { employeeName: 'Sarah Chen', initiativeTitle: 'Customer Portal Redesign', percentage: 80 },
      { employeeName: 'Sarah Chen', initiativeTitle: 'Mobile App v2', percentage: 20 },
      { employeeName: 'Mike Johnson', initiativeTitle: 'API Gateway Migration', percentage: 100 },
      { employeeName: 'Alex Rivera', initiativeTitle: 'Customer Portal Redesign', percentage: 60 },
      { employeeName: 'Alex Rivera', initiativeTitle: 'Notification System', percentage: 40 },
      { employeeName: 'Emily Watson', initiativeTitle: 'Data Pipeline Optimization', percentage: 100 },
      { employeeName: 'Priya Patel', initiativeTitle: 'API Gateway Migration', percentage: 50 },
      { employeeName: 'Priya Patel', initiativeTitle: 'Security Audit Implementation', percentage: 50 },
      { employeeName: 'James Lee', initiativeTitle: 'Notification System', percentage: 60 },
      { employeeName: 'James Lee', initiativeTitle: 'API Gateway Migration', percentage: 40 },
      { employeeName: 'Maria Garcia', initiativeTitle: 'Customer Portal Redesign', percentage: 60 },
      { employeeName: 'Maria Garcia', initiativeTitle: 'Mobile App v2', percentage: 40 },
      { employeeName: 'David Kim', initiativeTitle: 'Mobile App v2', percentage: 80 },
      { employeeName: 'David Kim', initiativeTitle: 'Customer Portal Redesign', percentage: 20 },
      { employeeName: 'Ryan Martinez', initiativeTitle: 'Security Audit Implementation', percentage: 100 },
    ];

    for (const allocData of allocationsData) {
      const employee = employees.find(e => e.name === allocData.employeeName);
      const initiative = initiatives.find(i => i.title === allocData.initiativeTitle);

      if (employee && initiative) {
        await prisma.allocation.create({
          data: {
            scenarioId: q1Scenario.id,
            employeeId: employee.id,
            initiativeId: initiative.id,
            startDate: new Date('2026-01-06'),
            endDate: new Date('2026-03-27'),
            percentage: allocData.percentage,
          },
        });
      }
    }
    console.log(`Created ${allocationsData.length} allocations for Q1 scenario`);

    // Create a comparison scenario
    const conservativeScenario = await prisma.scenario.create({
      data: {
        name: 'Q1 2026 Conservative',
        quarterRange: '2026-Q1:2026-Q2',
        assumptions: {
          allocationCapPercentage: 80,
          bufferPercentage: 20,
          proficiencyWeightEnabled: true,
          includeContractors: false,
          hoursPerQuarter: 520,
        },
        priorityRankings: initiatives.slice(0, 4).map((init, idx) => ({
          initiativeId: init.id,
          rank: idx + 1,
        })),
      },
    });
    console.log(`Created scenario: ${conservativeScenario.name}`);

  } else {
    console.log(`Scenarios already exist (${existingScenarios}), skipping...`);
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
