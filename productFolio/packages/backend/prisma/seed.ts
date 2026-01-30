import { PrismaClient, UserRole, InitiativeStatus, EmploymentType, OrgNodeType, ApprovalScope, ApprovalRuleType } from '@prisma/client';
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
      { name: 'Sarah Chen', role: 'Senior Frontend Engineer', skills: ['Frontend', 'React', 'TypeScript'], domains: ['E-Commerce', 'Customer Portal'], hoursPerWeek: 40 },
      { name: 'Mike Johnson', role: 'Backend Engineer', skills: ['Backend', 'Go', 'PostgreSQL'], domains: ['Payments', 'Infrastructure'], hoursPerWeek: 40 },
      { name: 'Alex Rivera', role: 'Full Stack Developer', skills: ['Frontend', 'Backend', 'React', 'Python'], domains: ['E-Commerce', 'Analytics'], hoursPerWeek: 40 },
      { name: 'Emily Watson', role: 'Data Engineer', skills: ['Data', 'Python', 'PostgreSQL', 'AWS'], domains: ['Analytics', 'Data Platform'], hoursPerWeek: 40 },
      { name: 'Priya Patel', role: 'DevOps Engineer', skills: ['DevOps', 'AWS', 'Docker', 'Kubernetes'], domains: ['Infrastructure', 'CI/CD'], hoursPerWeek: 40 },
      { name: 'James Lee', role: 'Senior Backend Engineer', skills: ['Backend', 'Go', 'Redis', 'PostgreSQL'], domains: ['Payments', 'Search'], hoursPerWeek: 40 },
      { name: 'Maria Garcia', role: 'UX Designer', skills: ['Design', 'Figma', 'Research'], domains: ['Customer Portal', 'Design Systems'], hoursPerWeek: 40 },
      { name: 'David Kim', role: 'Frontend Engineer', skills: ['Frontend', 'React', 'TypeScript', 'CSS'], domains: ['E-Commerce', 'Design Systems'], hoursPerWeek: 40 },
      { name: 'Lisa Thompson', role: 'Product Manager', skills: ['Product', 'Strategy', 'Analytics'], domains: ['Strategy', 'Customer Portal'], hoursPerWeek: 40 },
      { name: 'Ryan Martinez', role: 'Security Engineer', skills: ['Security', 'Backend', 'DevOps'], domains: ['Security', 'Infrastructure'], hoursPerWeek: 32 },
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

      // Create domains for the employee
      for (let i = 0; i < empData.domains.length; i++) {
        await prisma.domain.create({
          data: {
            employeeId: employee.id,
            name: empData.domains[i],
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
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
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
        deliveryHealth: 'DELAYED' as const,
        scopeItems: [
          { name: 'Pipeline Redesign', skillDemand: { Data: 120, Python: 100 }, estimateP50: 200, estimateP90: 250 },
          { name: 'Performance Tuning', skillDemand: { Backend: 120, PostgreSQL: 80 }, estimateP50: 120, estimateP90: 160 },
        ],
      },
      {
        title: 'Analytics Dashboard',
        description: 'New analytics dashboard for business intelligence',
        status: InitiativeStatus.SCOPING,
        targetQuarter: '2026-Q2',
        deliveryHealth: null,
        scopeItems: [
          { name: 'Dashboard UI', skillDemand: { Frontend: 200, React: 180 }, estimateP50: 200, estimateP90: 260 },
          { name: 'Data Processing', skillDemand: { Data: 120, Python: 100 }, estimateP50: 120, estimateP90: 160 },
          { name: 'Visualization Design', skillDemand: { Design: 80 }, estimateP50: 80, estimateP90: 100 },
        ],
      },
      {
        title: 'Security Audit Implementation',
        description: 'Implement findings from security audit',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
        deliveryHealth: 'ON_TRACK' as const,
        scopeItems: [
          { name: 'Security Fixes', skillDemand: { Security: 40, Backend: 80 }, estimateP50: 120, estimateP90: 160 },
          { name: 'Infrastructure Hardening', skillDemand: { DevOps: 80, Security: 40 }, estimateP50: 120, estimateP90: 150 },
        ],
      },
      {
        title: 'Search Infrastructure',
        description: 'Build new search infrastructure using Elasticsearch',
        status: InitiativeStatus.PROPOSED,
        targetQuarter: '2026-Q2',
        deliveryHealth: null,
        scopeItems: [
          { name: 'Search Service', skillDemand: { Backend: 320, Go: 240 }, estimateP50: 320, estimateP90: 400 },
          { name: 'Indexing Pipeline', skillDemand: { Data: 160, Python: 120 }, estimateP50: 160, estimateP90: 200 },
          { name: 'DevOps Setup', skillDemand: { DevOps: 80 }, estimateP50: 80, estimateP90: 100 },
        ],
      },
      {
        title: 'Notification System',
        description: 'Centralized notification system for all channels',
        status: InitiativeStatus.RESOURCING,
        targetQuarter: '2026-Q1',
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
          deliveryHealth: initData.deliveryHealth,
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
  // ORG TREE & APPROVAL POLICIES
  // ============================================================================

  const existingOrgNodes = await prisma.orgNode.count();
  if (existingOrgNodes === 0) {
    console.log('Creating org tree...');

    // Fetch employees for manager assignments
    const allEmployees = await prisma.employee.findMany();
    const findEmployee = (name: string) => allEmployees.find(e => e.name === name);

    // ROOT node
    const root = await prisma.orgNode.create({
      data: {
        name: 'Acme Corp',
        code: 'ACME',
        type: OrgNodeType.ROOT,
        path: '/',
        depth: 0,
      },
    });
    // Update path to include own ID
    await prisma.orgNode.update({
      where: { id: root.id },
      data: { path: `/${root.id}/` },
    });
    console.log(`Created ROOT node: ${root.name}`);

    // Engineering Division
    const engineering = await prisma.orgNode.create({
      data: {
        name: 'Engineering',
        code: 'ENG',
        type: OrgNodeType.DIVISION,
        parentId: root.id,
        managerId: findEmployee('James Lee')?.id,
        path: `/${root.id}/`,
        depth: 1,
      },
    });
    await prisma.orgNode.update({
      where: { id: engineering.id },
      data: { path: `/${root.id}/${engineering.id}/` },
    });

    // Frontend Team
    const frontendTeam = await prisma.orgNode.create({
      data: {
        name: 'Frontend',
        code: 'FE',
        type: OrgNodeType.TEAM,
        parentId: engineering.id,
        managerId: findEmployee('Sarah Chen')?.id,
        path: `/${root.id}/${engineering.id}/`,
        depth: 2,
      },
    });
    await prisma.orgNode.update({
      where: { id: frontendTeam.id },
      data: { path: `/${root.id}/${engineering.id}/${frontendTeam.id}/` },
    });

    // Backend Team
    const backendTeam = await prisma.orgNode.create({
      data: {
        name: 'Backend',
        code: 'BE',
        type: OrgNodeType.TEAM,
        parentId: engineering.id,
        managerId: findEmployee('Mike Johnson')?.id,
        path: `/${root.id}/${engineering.id}/`,
        depth: 2,
      },
    });
    await prisma.orgNode.update({
      where: { id: backendTeam.id },
      data: { path: `/${root.id}/${engineering.id}/${backendTeam.id}/` },
    });

    // DevOps Team
    const devopsTeam = await prisma.orgNode.create({
      data: {
        name: 'DevOps',
        code: 'DEVOPS',
        type: OrgNodeType.TEAM,
        parentId: engineering.id,
        managerId: findEmployee('Priya Patel')?.id,
        path: `/${root.id}/${engineering.id}/`,
        depth: 2,
      },
    });
    await prisma.orgNode.update({
      where: { id: devopsTeam.id },
      data: { path: `/${root.id}/${engineering.id}/${devopsTeam.id}/` },
    });

    // Product Division
    const product = await prisma.orgNode.create({
      data: {
        name: 'Product',
        code: 'PROD',
        type: OrgNodeType.DIVISION,
        parentId: root.id,
        managerId: findEmployee('Lisa Thompson')?.id,
        path: `/${root.id}/`,
        depth: 1,
      },
    });
    await prisma.orgNode.update({
      where: { id: product.id },
      data: { path: `/${root.id}/${product.id}/` },
    });

    // Design Team
    const designTeam = await prisma.orgNode.create({
      data: {
        name: 'Design',
        code: 'DESIGN',
        type: OrgNodeType.TEAM,
        parentId: product.id,
        managerId: findEmployee('Maria Garcia')?.id,
        path: `/${root.id}/${product.id}/`,
        depth: 2,
      },
    });
    await prisma.orgNode.update({
      where: { id: designTeam.id },
      data: { path: `/${root.id}/${product.id}/${designTeam.id}/` },
    });

    // Unassigned (Virtual) node
    const unassigned = await prisma.orgNode.create({
      data: {
        name: 'Unassigned',
        code: 'UNASSIGNED',
        type: OrgNodeType.VIRTUAL,
        parentId: root.id,
        path: `/${root.id}/`,
        depth: 1,
      },
    });
    await prisma.orgNode.update({
      where: { id: unassigned.id },
      data: { path: `/${root.id}/${unassigned.id}/` },
    });

    console.log('Created org tree with divisions and teams');

    // Assign employees to teams
    const membershipAssignments = [
      { employee: 'Sarah Chen', nodeId: frontendTeam.id },
      { employee: 'David Kim', nodeId: frontendTeam.id },
      { employee: 'Mike Johnson', nodeId: backendTeam.id },
      { employee: 'James Lee', nodeId: backendTeam.id },
      { employee: 'Alex Rivera', nodeId: backendTeam.id },
      { employee: 'Priya Patel', nodeId: devopsTeam.id },
      { employee: 'Ryan Martinez', nodeId: devopsTeam.id },
      { employee: 'Emily Watson', nodeId: backendTeam.id },
      { employee: 'Maria Garcia', nodeId: designTeam.id },
      { employee: 'Lisa Thompson', nodeId: product.id },
    ];

    for (const assignment of membershipAssignments) {
      const employee = findEmployee(assignment.employee);
      if (employee) {
        await prisma.orgMembership.create({
          data: {
            employeeId: employee.id,
            orgNodeId: assignment.nodeId,
            effectiveStart: new Date(),
          },
        });
      }
    }
    console.log(`Created ${membershipAssignments.length} org memberships`);

    // Create approval policies
    // Level 1: Team managers approve resource allocations
    const teamNodes = [frontendTeam, backendTeam, devopsTeam, designTeam];
    for (const teamNode of teamNodes) {
      await prisma.approvalPolicy.create({
        data: {
          orgNodeId: teamNode.id,
          scope: ApprovalScope.RESOURCE_ALLOCATION,
          level: 1,
          ruleType: ApprovalRuleType.NODE_MANAGER,
          ruleConfig: {},
        },
      });
    }

    // Level 2: Division heads approve resource allocations
    const divisionNodes = [engineering, product];
    for (const divNode of divisionNodes) {
      await prisma.approvalPolicy.create({
        data: {
          orgNodeId: divNode.id,
          scope: ApprovalScope.RESOURCE_ALLOCATION,
          level: 2,
          ruleType: ApprovalRuleType.NODE_MANAGER,
          ruleConfig: {},
        },
      });
    }

    // Initiative approvals at division level
    for (const divNode of divisionNodes) {
      await prisma.approvalPolicy.create({
        data: {
          orgNodeId: divNode.id,
          scope: ApprovalScope.INITIATIVE,
          level: 1,
          ruleType: ApprovalRuleType.NODE_MANAGER,
          ruleConfig: {},
        },
      });
    }

    // Scenario approvals require admin (specific person)
    await prisma.approvalPolicy.create({
      data: {
        orgNodeId: root.id,
        scope: ApprovalScope.SCENARIO,
        level: 1,
        ruleType: ApprovalRuleType.SPECIFIC_PERSON,
        ruleConfig: { userId: admin.id },
      },
    });

    // Fallback admin policy at root for all scopes
    for (const scope of [ApprovalScope.RESOURCE_ALLOCATION, ApprovalScope.INITIATIVE, ApprovalScope.SCENARIO]) {
      await prisma.approvalPolicy.create({
        data: {
          orgNodeId: root.id,
          scope,
          level: 99,
          ruleType: ApprovalRuleType.FALLBACK_ADMIN,
          ruleConfig: {},
        },
      });
    }

    console.log('Created approval policies');
  } else {
    console.log(`Org nodes already exist (${existingOrgNodes}), skipping...`);
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
      where: { status: { in: [InitiativeStatus.RESOURCING, InitiativeStatus.IN_EXECUTION] } },
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
