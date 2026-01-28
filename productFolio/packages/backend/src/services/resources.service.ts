import { prisma } from '../lib/prisma.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../lib/errors.js';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeeFiltersInput,
  CreateSkillInput,
  UpdateSkillInput,
} from '../schemas/resources.schema.js';

// ============================================================================
// Employee Service Methods
// ============================================================================

export async function listEmployees(
  filters: EmployeeFiltersInput,
  pagination: { page: number; limit: number }
) {
  const { role, employmentType, managerId, search, page, limit } = filters;

  const where: Record<string, unknown> = {};

  if (role) {
    where.role = role;
  }

  if (employmentType) {
    where.employmentType = employmentType;
  }

  if (managerId) {
    where.managerId = managerId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { role: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      include: {
        manager: {
          select: {
            id: true,
            name: true,
          },
        },
        skills: {
          select: {
            name: true,
          },
        },
        _count: {
          select: { skills: true, allocations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.employee.count({ where }),
  ]);

  // Transform to match frontend expected format
  const data = employees.map(emp => ({
    id: emp.id,
    name: emp.name,
    email: `${emp.name.toLowerCase().replace(/\s+/g, '.')}@company.com`, // Generate email from name
    title: emp.role,
    department: null, // Not in schema
    managerId: emp.managerId,
    skills: emp.skills.map(s => s.name),
    defaultCapacityHours: emp.hoursPerWeek,
    createdAt: emp.createdAt.toISOString(),
    updatedAt: emp.updatedAt.toISOString(),
  }));

  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getEmployeeById(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
        },
      },
      directReports: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      skills: true,
      _count: {
        select: { allocations: true },
      },
    },
  });

  if (!employee) {
    throw new NotFoundError('Employee', id);
  }

  return employee;
}

export async function createEmployee(data: CreateEmployeeInput) {
  // Validate manager exists if provided
  if (data.managerId) {
    const manager = await prisma.employee.findUnique({
      where: { id: data.managerId },
    });

    if (!manager) {
      throw new NotFoundError('Manager', data.managerId);
    }
  }

  const employee = await prisma.employee.create({
    data: {
      name: data.name,
      role: data.role,
      managerId: data.managerId || null,
      employmentType: data.employmentType,
      hoursPerWeek: data.hoursPerWeek,
      activeStart: data.activeStart || new Date(),
      activeEnd: data.activeEnd || null,
    },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return employee;
}

export async function updateEmployee(
  id: string,
  data: UpdateEmployeeInput
) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id },
  });

  if (!employee) {
    throw new NotFoundError('Employee', id);
  }

  // Validate manager if provided
  if (data.managerId) {
    // Prevent circular manager references first
    if (data.managerId === id) {
      throw new ValidationError('An employee cannot be their own manager');
    }

    const manager = await prisma.employee.findUnique({
      where: { id: data.managerId },
    });

    if (!manager) {
      throw new NotFoundError('Manager', data.managerId);
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
      managerId: data.managerId !== undefined ? data.managerId : employee.managerId,
      employmentType: data.employmentType,
      hoursPerWeek: data.hoursPerWeek,
      activeStart: data.activeStart,
      activeEnd: data.activeEnd !== undefined ? data.activeEnd : employee.activeEnd,
    },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return updated;
}

export async function deleteEmployee(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
  });

  if (!employee) {
    throw new NotFoundError('Employee', id);
  }

  await prisma.employee.delete({
    where: { id },
  });

  return { id };
}

// ============================================================================
// Skill Service Methods
// ============================================================================

export async function getEmployeeSkills(employeeId: string) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  const skills = await prisma.skill.findMany({
    where: { employeeId },
    orderBy: { name: 'asc' },
  });

  return skills;
}

export async function addSkill(
  employeeId: string,
  data: CreateSkillInput
) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  // Check if skill already exists for this employee
  const existingSkill = await prisma.skill.findUnique({
    where: {
      employeeId_name: {
        employeeId,
        name: data.name,
      },
    },
  });

  if (existingSkill) {
    throw new ConflictError(
      `Skill "${data.name}" already exists for this employee`
    );
  }

  const skill = await prisma.skill.create({
    data: {
      name: data.name,
      proficiency: data.proficiency,
      employeeId,
    },
  });

  return skill;
}

export async function updateSkill(
  employeeId: string,
  skillId: string,
  data: UpdateSkillInput
) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  // Verify skill exists and belongs to the employee
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
  });

  if (!skill || skill.employeeId !== employeeId) {
    throw new NotFoundError('Skill', skillId);
  }

  const updated = await prisma.skill.update({
    where: { id: skillId },
    data: {
      proficiency: data.proficiency,
    },
  });

  return updated;
}

export async function removeSkill(
  employeeId: string,
  skillId: string
) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee', employeeId);
  }

  // Verify skill exists and belongs to the employee
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
  });

  if (!skill || skill.employeeId !== employeeId) {
    throw new NotFoundError('Skill', skillId);
  }

  await prisma.skill.delete({
    where: { id: skillId },
  });

  return { id: skillId };
}
