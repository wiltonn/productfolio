import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SearchInput, Checkbox, StatusBadge } from '../components/ui';
import { useEmployees, useCreateEmployee, useUpdateEmployee, useEmployeeAllocations, useEmployeeAllocationSummaries, useEmployeePtoHours, Employee } from '../hooks/useEmployees';
import type { EmployeeAllocation, QuarterAllocationSummary, PtoHoursResponse } from '../hooks/useEmployees';
import { useQuarterPeriods } from '../hooks/usePeriods';
import type { Period } from '../hooks/usePeriods';
import { useOrgTree, useMemberships } from '../hooks/useOrgTree';
import { useFeatureFlag } from '../hooks/useFeatureFlags';
import { flattenOrgTree } from '../utils/org-tree';
import { api } from '../api/client';
import { EmployeeOrgRelationships } from './EmployeeOrgRelationships';

const LOCKED_STATUSES = ['RESOURCING', 'IN_EXECUTION', 'COMPLETE'];

// Allocation Badge Component
function AllocationBadge({ percentage }: { percentage: number }) {
  const rounded = Math.round(percentage);
  let colorClasses: string;
  if (rounded === 0) {
    colorClasses = 'bg-surface-100 text-surface-500';
  } else if (rounded <= 80) {
    colorClasses = 'bg-emerald-50 text-emerald-700';
  } else if (rounded <= 100) {
    colorClasses = 'bg-amber-50 text-amber-700';
  } else {
    colorClasses = 'bg-red-50 text-red-700';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums ${colorClasses}`}>
      {rounded}%
    </span>
  );
}

// Types
interface Skill {
  name: string;
  proficiency: number; // 1-5
}

interface Domain {
  name: string;
  proficiency: number; // 1-5
}

interface CapacityEmployee {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  skills: Skill[];
  domains: Domain[];
  hoursPerWeek: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'CONTRACTOR';
  avatarColor: string;
  ptoHours: number;
}

interface CapacitySettings {
  defaultHoursPerWeek: number;
  ktloPercentage: number;
  meetingOverheadPercentage: number;
  holidays: Date[];
}

interface Holiday {
  date: Date;
  name: string;
}

// Mock Data
const SKILL_OPTIONS = [
  'Frontend', 'Backend', 'React', 'TypeScript', 'Go', 'Python',
  'PostgreSQL', 'Redis', 'AWS', 'DevOps', 'Design', 'Data', 'ML/AI'
];

const DOMAIN_OPTIONS = [
  'E-Commerce', 'Payments', 'Analytics', 'Infrastructure', 'Customer Portal',
  'Search', 'Security', 'Data Platform', 'CI/CD', 'Design Systems', 'Strategy'
];

const AVATAR_COLORS = [
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
  'from-emerald-400 to-emerald-600',
  'from-cyan-400 to-cyan-600',
  'from-violet-400 to-violet-600',
  'from-fuchsia-400 to-fuchsia-600',
];

// Map API Employee to CapacityEmployee format
function mapEmployeeToCapacity(employee: Employee, index: number, ptoHours?: number): CapacityEmployee {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.title || 'Team Member',
    department: employee.department || 'Engineering',
    skills: employee.skills.map(s => ({ name: s, proficiency: 3 })),
    domains: (employee.domains || []).map(d => ({ name: d, proficiency: 3 })),
    hoursPerWeek: employee.defaultCapacityHours,
    status: 'ACTIVE',
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    ptoHours: ptoHours ?? 0,
  };
}


// Slider Component
function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  suffix = '%',
  showValue = true,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  showValue?: boolean;
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-surface-700">{label}</span>}
          {showValue && (
            <span className="text-sm font-mono font-semibold text-accent-700 tabular-nums">
              {value}{suffix}
            </span>
          )}
        </div>
      )}
      <div className="relative h-2 group">
        <div className="absolute inset-0 bg-surface-200 rounded-full" />
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-accent-500 rounded-full shadow-md transition-all group-hover:scale-110 pointer-events-none"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
    </div>
  );
}

// Star Rating Component
function StarRating({
  value,
  onChange,
  max = 5,
  readonly = false,
  size = 'md',
}: {
  value: number;
  onChange?: (v: number) => void;
  max?: number;
  readonly?: boolean;
  size?: 'sm' | 'md';
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayValue = hovered ?? value;
  const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= displayValue;

        return (
          <button
            key={i}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(starValue)}
            onMouseEnter={() => !readonly && setHovered(starValue)}
            onMouseLeave={() => setHovered(null)}
            className={`${readonly ? '' : 'cursor-pointer hover:scale-110'} transition-transform`}
          >
            <svg
              className={`${sizeClass} transition-colors ${
                isFilled
                  ? 'text-amber-400'
                  : 'text-surface-300'
              }`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// Slide-over Panel Component
function SlideOver({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-200">
          <h2 className="text-lg font-display font-semibold text-surface-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-73px)]">
          {children}
        </div>
      </div>
    </div>
  );
}

// Employee Form Component
function EmployeeForm({
  employee,
  onSave,
  onCancel,
}: {
  employee?: CapacityEmployee | null;
  onSave: (data: Partial<CapacityEmployee>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Partial<CapacityEmployee>>({
    name: employee?.name || '',
    email: employee?.email || '',
    role: employee?.role || '',
    department: employee?.department || '',
    hoursPerWeek: employee?.hoursPerWeek || 40,
    status: employee?.status || 'ACTIVE',
    skills: employee?.skills || [],
    domains: employee?.domains || [],
    ptoHours: employee?.ptoHours || 0,
  });

  const [newSkill, setNewSkill] = useState('');
  const [newDomain, setNewDomain] = useState('');

  const addSkill = (skillName: string) => {
    if (skillName && !formData.skills?.find(s => s.name === skillName)) {
      setFormData(prev => ({
        ...prev,
        skills: [...(prev.skills || []), { name: skillName, proficiency: 3 }]
      }));
    }
    setNewSkill('');
  };

  const removeSkill = (skillName: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills?.filter(s => s.name !== skillName) || []
    }));
  };

  const updateSkillProficiency = (skillName: string, proficiency: number) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills?.map(s =>
        s.name === skillName ? { ...s, proficiency } : s
      ) || []
    }));
  };

  const addDomain = (domainName: string) => {
    if (domainName && !formData.domains?.find(d => d.name === domainName)) {
      setFormData(prev => ({
        ...prev,
        domains: [...(prev.domains || []), { name: domainName, proficiency: 3 }]
      }));
    }
    setNewDomain('');
  };

  const removeDomain = (domainName: string) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains?.filter(d => d.name !== domainName) || []
    }));
  };

  const updateDomainProficiency = (domainName: string, proficiency: number) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains?.map(d =>
        d.name === domainName ? { ...d, proficiency } : d
      ) || []
    }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Basic Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="input"
              placeholder="jane@company.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Role</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="input"
              placeholder="Senior Engineer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Department</label>
            <input
              type="text"
              value={formData.department}
              onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
              className="input"
              placeholder="Engineering"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Hours/Week</label>
            <input
              type="number"
              value={formData.hoursPerWeek}
              onChange={(e) => setFormData(prev => ({ ...prev, hoursPerWeek: Number(e.target.value) }))}
              className="input font-mono"
              min={0}
              max={60}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as CapacityEmployee['status'] }))}
              className="input"
            >
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="CONTRACTOR">Contractor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Technology</h3>

        {/* Add Skill */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSkill(newSkill)}
              className="input"
              placeholder="Add a skill..."
              list="skill-suggestions"
            />
            <datalist id="skill-suggestions">
              {SKILL_OPTIONS.filter(s => !formData.skills?.find(fs => fs.name === s)).map(skill => (
                <option key={skill} value={skill} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            onClick={() => addSkill(newSkill)}
            className="btn-secondary"
          >
            Add
          </button>
        </div>

        {/* Quick Add */}
        <div className="flex flex-wrap gap-1.5">
          {SKILL_OPTIONS.filter(s => !formData.skills?.find(fs => fs.name === s)).slice(0, 6).map(skill => (
            <button
              key={skill}
              type="button"
              onClick={() => addSkill(skill)}
              className="px-2 py-1 text-xs font-medium text-surface-600 bg-surface-100 rounded-md hover:bg-surface-200 transition-colors"
            >
              + {skill}
            </button>
          ))}
        </div>

        {/* Skills List */}
        {formData.skills && formData.skills.length > 0 && (
          <div className="space-y-3 pt-2">
            {formData.skills.map(skill => (
              <div
                key={skill.name}
                className="flex items-center justify-between p-3 bg-surface-50 rounded-lg group"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-surface-800">{skill.name}</span>
                  <StarRating
                    value={skill.proficiency}
                    onChange={(v) => updateSkillProficiency(skill.name, v)}
                    size="sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSkill(skill.name)}
                  className="p-1 rounded text-surface-400 hover:text-danger hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Domains */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Domain</h3>

        {/* Add Domain */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDomain(newDomain)}
              className="input"
              placeholder="Add a domain..."
              list="domain-suggestions"
            />
            <datalist id="domain-suggestions">
              {DOMAIN_OPTIONS.filter(d => !formData.domains?.find(fd => fd.name === d)).map(domain => (
                <option key={domain} value={domain} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            onClick={() => addDomain(newDomain)}
            className="btn-secondary"
          >
            Add
          </button>
        </div>

        {/* Quick Add */}
        <div className="flex flex-wrap gap-1.5">
          {DOMAIN_OPTIONS.filter(d => !formData.domains?.find(fd => fd.name === d)).slice(0, 6).map(domain => (
            <button
              key={domain}
              type="button"
              onClick={() => addDomain(domain)}
              className="px-2 py-1 text-xs font-medium text-surface-600 bg-surface-100 rounded-md hover:bg-surface-200 transition-colors"
            >
              + {domain}
            </button>
          ))}
        </div>

        {/* Domains List */}
        {formData.domains && formData.domains.length > 0 && (
          <div className="space-y-3 pt-2">
            {formData.domains.map(domain => (
              <div
                key={domain.name}
                className="flex items-center justify-between p-3 bg-surface-50 rounded-lg group"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-surface-800">{domain.name}</span>
                  <StarRating
                    value={domain.proficiency}
                    onChange={(v) => updateDomainProficiency(domain.name, v)}
                    size="sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeDomain(domain.name)}
                  className="p-1 rounded text-surface-400 hover:text-danger hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PTO */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Time Off (This Quarter)</h3>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5">PTO Hours</label>
          <input
            type="number"
            value={formData.ptoHours}
            onChange={(e) => setFormData(prev => ({ ...prev, ptoHours: Number(e.target.value) }))}
            className="input font-mono w-32"
            min={0}
            step={8}
          />
          <p className="mt-1.5 text-xs text-surface-500">
            Reduces effective capacity for this quarter
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-surface-50 border-t border-surface-200 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(formData)}
          className="btn-primary"
        >
          {employee ? 'Save Changes' : 'Add Employee'}
        </button>
      </div>
    </div>
  );
}

// Employee Assignments Component
function EmployeeAssignments({
  employeeId,
  allocationSummary,
  quarterLabels,
}: {
  employeeId: string;
  allocationSummary?: QuarterAllocationSummary;
  quarterLabels: { current: string; next: string };
}) {
  const { data: allocations, isLoading } = useEmployeeAllocations(employeeId);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-600"></div>
      </div>
    );
  }

  const isEmpty = !allocations || allocations.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Quarterly summary header */}
      {allocationSummary && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Quarterly Allocation</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
              <p className="text-xs text-surface-500 mb-1">{quarterLabels.current}</p>
              <AllocationBadge percentage={allocationSummary.currentQuarterPct} />
            </div>
            <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
              <p className="text-xs text-surface-500 mb-1">{quarterLabels.next}</p>
              <AllocationBadge percentage={allocationSummary.nextQuarterPct} />
            </div>
          </div>
          {/* Progress bar for current quarter */}
          <div>
            <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
              <span>{quarterLabels.current} utilization</span>
              <span className="font-mono tabular-nums">{Math.round(allocationSummary.currentQuarterPct)}%</span>
            </div>
            <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  allocationSummary.currentQuarterPct <= 80
                    ? 'bg-emerald-500'
                    : allocationSummary.currentQuarterPct <= 100
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(allocationSummary.currentQuarterPct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-4">
          <svg className="w-12 h-12 mx-auto text-surface-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          <p className="text-sm text-surface-500">No initiative assignments yet</p>
          <p className="text-xs text-surface-400 mt-1">Allocate this employee to initiatives in the Scenario Planner</p>
        </div>
      ) : (
        <>
          {/* Group allocations by scenario */}
          {Object.entries(
            allocations!.reduce<Record<string, { scenarioName: string; allocations: EmployeeAllocation[] }>>((acc, alloc) => {
              if (!acc[alloc.scenarioId]) {
                acc[alloc.scenarioId] = { scenarioName: alloc.scenarioName, allocations: [] };
              }
              acc[alloc.scenarioId].allocations.push(alloc);
              return acc;
            }, {})
          ).map(([scenarioId, group]) => (
            <div key={scenarioId}>
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
                {group.scenarioName}
              </h4>
              <div className="space-y-2">
                {group.allocations.map((alloc) => {
                  const isLocked = alloc.initiativeStatus !== null && LOCKED_STATUSES.includes(alloc.initiativeStatus);
                  return (
                    <div
                      key={alloc.id}
                      className="p-3 bg-surface-50 rounded-lg border border-surface-200 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-surface-900 text-sm">
                            {alloc.initiativeTitle || 'Unassigned'}
                          </span>
                          {isLocked && (
                            <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        {alloc.initiativeStatus && (
                          <StatusBadge status={alloc.initiativeStatus as any} />
                        )}
                      </div>
                      {/* Allocation bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-500 rounded-full"
                            style={{ width: `${Math.min(alloc.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-semibold tabular-nums text-surface-700">{alloc.percentage}%</span>
                      </div>
                      {/* Date range */}
                      <div className="flex items-center gap-1.5 text-xs text-surface-500">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                        </svg>
                        <span>
                          {new Date(alloc.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' - '}
                          {new Date(alloc.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Effective Capacity Preview Component
function EffectiveCapacityPreview({
  employees,
  settings,
  holidays,
  quarterDates,
}: {
  employees: CapacityEmployee[];
  settings: CapacitySettings;
  holidays: Holiday[];
  quarterDates: {
    currentQStart: string;
    currentQEnd: string;
    nextQStart: string;
    nextQEnd: string;
    currentLabel: string;
    nextLabel: string;
  };
}) {
  const [selectedQuarter, setSelectedQuarter] = useState<'current' | 'next'>('current');

  const { currentCalc, nextCalc } = useMemo(() => {
    function parseDate(dateStr: string): Date {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    function countWorkingDays(start: Date, end: Date): number {
      let count = 0;
      const d = new Date(start);
      while (d <= end) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) count++;
        d.setDate(d.getDate() + 1);
      }
      return count;
    }

    function calcForQuarter(qStartStr: string, qEndStr: string) {
      const qStart = parseDate(qStartStr);
      const qEnd = parseDate(qEndStr);
      const workingDays = countWorkingDays(qStart, qEnd);

      const activeEmployees = employees.filter(e => e.status !== 'ON_LEAVE');
      const totalWeeklyHours = activeEmployees.reduce((sum, e) => sum + e.hoursPerWeek, 0);
      const totalPtoHours = employees.reduce((sum, e) => sum + e.ptoHours, 0);

      // Gross capacity: per-employee daily rate × working days
      const grossHours = activeEmployees.reduce(
        (sum, e) => sum + (e.hoursPerWeek / 5) * workingDays, 0
      );

      // Only count holidays that fall on weekdays within this quarter
      const quarterHolidays = holidays.filter(h => {
        const hd = new Date(h.date);
        const day = hd.getDay();
        return hd >= qStart && hd <= qEnd && day !== 0 && day !== 6;
      });
      const dailyTeamHours = totalWeeklyHours / 5;
      const holidayHours = quarterHolidays.length * dailyTeamHours;

      // Net available after PTO and holidays
      const netAvailable = grossHours - totalPtoHours - holidayHours;

      // KTLO and meetings are percentages of net available work time
      const ktloHours = netAvailable * (settings.ktloPercentage / 100);
      const meetingHours = netAvailable * (settings.meetingOverheadPercentage / 100);

      const effectiveHours = netAvailable - ktloHours - meetingHours;
      const utilizationPercent = grossHours > 0
        ? Math.round((effectiveHours / grossHours) * 100)
        : 0;

      return {
        activeEmployees: activeEmployees.length,
        totalEmployees: employees.length,
        totalWeeklyHours,
        workingDays,
        grossHours: Math.round(grossHours),
        ptoHours: totalPtoHours,
        holidayCount: quarterHolidays.length,
        holidayHours: Math.round(holidayHours),
        ktloHours: Math.round(ktloHours),
        meetingHours: Math.round(meetingHours),
        effectiveHours: Math.round(effectiveHours),
        utilizationPercent,
      };
    }

    return {
      currentCalc: calcForQuarter(quarterDates.currentQStart, quarterDates.currentQEnd),
      nextCalc: calcForQuarter(quarterDates.nextQStart, quarterDates.nextQEnd),
    };
  }, [employees, settings, holidays, quarterDates]);

  const calc = selectedQuarter === 'current' ? currentCalc : nextCalc;
  const label = selectedQuarter === 'current' ? quarterDates.currentLabel : quarterDates.nextLabel;

  return (
    <div className="card overflow-hidden">
      {/* Quarter selector tabs */}
      <div className="flex border-b border-surface-200">
        <button
          onClick={() => setSelectedQuarter('current')}
          className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            selectedQuarter === 'current'
              ? 'text-accent-700 border-b-2 border-accent-500 bg-surface-50'
              : 'text-surface-500 hover:text-surface-700'
          }`}
        >
          {quarterDates.currentLabel}
        </button>
        <button
          onClick={() => setSelectedQuarter('next')}
          className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            selectedQuarter === 'next'
              ? 'text-accent-700 border-b-2 border-accent-500 bg-surface-50'
              : 'text-surface-500 hover:text-surface-700'
          }`}
        >
          {quarterDates.nextLabel}
        </button>
      </div>

      {/* Both quarters at a glance */}
      <div className="grid grid-cols-2 divide-x divide-surface-200 bg-gradient-to-br from-surface-50 to-surface-100">
        <button
          onClick={() => setSelectedQuarter('current')}
          className={`p-4 text-center transition-colors ${selectedQuarter === 'current' ? 'bg-white/50' : 'hover:bg-white/30'}`}
        >
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{quarterDates.currentLabel}</p>
          <p className="mt-1 text-2xl font-display font-bold text-surface-900 tabular-nums">
            {currentCalc.effectiveHours.toLocaleString()}
            <span className="text-sm font-normal text-surface-500 ml-0.5">h</span>
          </p>
        </button>
        <button
          onClick={() => setSelectedQuarter('next')}
          className={`p-4 text-center transition-colors ${selectedQuarter === 'next' ? 'bg-white/50' : 'hover:bg-white/30'}`}
        >
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{quarterDates.nextLabel}</p>
          <p className="mt-1 text-2xl font-display font-bold text-surface-900 tabular-nums">
            {nextCalc.effectiveHours.toLocaleString()}
            <span className="text-sm font-normal text-surface-500 ml-0.5">h</span>
          </p>
        </button>
      </div>

      {/* Detailed breakdown for selected quarter */}
      <div className="p-5 border-t border-surface-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">
            {label} Breakdown
          </h3>
          {/* Circular gauge */}
          <div className="relative w-14 h-14">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-200" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${calc.utilizationPercent * 2.64} 264`}
                className="text-accent-500 transition-all duration-500" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-display font-bold text-surface-900 tabular-nums">{calc.utilizationPercent}%</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-600">Gross Capacity ({calc.workingDays} days)</span>
            <span className="font-mono font-medium text-surface-900 tabular-nums">
              {calc.grossHours.toLocaleString()}h
            </span>
          </div>

          <div className="h-px bg-surface-100" />

          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-600">− PTO</span>
            <span className="font-mono text-danger tabular-nums">−{calc.ptoHours}h</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-600">− Holidays ({calc.holidayCount} days)</span>
            <span className="font-mono text-danger tabular-nums">−{calc.holidayHours.toLocaleString()}h</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-600">− KTLO ({settings.ktloPercentage}%)</span>
            <span className="font-mono text-danger tabular-nums">−{calc.ktloHours.toLocaleString()}h</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-600">− Meetings ({settings.meetingOverheadPercentage}%)</span>
            <span className="font-mono text-danger tabular-nums">−{calc.meetingHours.toLocaleString()}h</span>
          </div>

          <div className="h-px bg-surface-200" />

          <div className="flex items-center justify-between">
            <span className="font-medium text-surface-900">Available for Projects</span>
            <span className="font-mono font-bold text-accent-700 tabular-nums">
              {calc.effectiveHours.toLocaleString()}h
            </span>
          </div>
        </div>
      </div>

      {/* Team summary */}
      <div className="px-5 py-4 bg-surface-50 border-t border-surface-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-600">
            {calc.activeEmployees} active / {calc.totalEmployees} total
          </span>
          <span className="text-surface-600">
            {calc.totalWeeklyHours}h/week base
          </span>
        </div>
      </div>
    </div>
  );
}

// Default holidays (can be fetched from API in the future)
const DEFAULT_HOLIDAYS: Holiday[] = [
  { date: new Date(2026, 0, 1), name: "New Year's Day" },
  { date: new Date(2026, 0, 19), name: 'MLK Day' },
  { date: new Date(2026, 1, 16), name: "Presidents' Day" },
  { date: new Date(2026, 4, 25), name: 'Memorial Day' },
  { date: new Date(2026, 6, 3), name: 'Independence Day (Observed)' },
  { date: new Date(2026, 8, 7), name: 'Labor Day' },
  { date: new Date(2026, 10, 26), name: 'Thanksgiving' },
  { date: new Date(2026, 11, 25), name: 'Christmas' },
];

// Main Component
export function Capacity() {
  // Feature flags
  const { enabled: matrixOrgEnabled } = useFeatureFlag('matrix_org_v1');

  // Org node filter
  const { data: orgTree } = useOrgTree();
  const [orgNodeFilter, setOrgNodeFilter] = useState<string>('');
  const flatNodes = useMemo(() => flattenOrgTree(orgTree ?? []), [orgTree]);
  const { data: membershipsData } = useMemberships(
    orgNodeFilter ? { orgNodeId: orgNodeFilter, activeOnly: true, limit: 500 } : undefined
  );
  const orgMemberEmployeeIds = useMemo(() => {
    if (!orgNodeFilter || !membershipsData?.data) return null;
    return new Set(membershipsData.data.map((m) => m.employeeId));
  }, [orgNodeFilter, membershipsData]);

  // Fetch employees from API
  const { data: employeesData, isLoading } = useEmployees({ limit: 100 });
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const queryClient = useQueryClient();

  // Fetch quarter periods to resolve current quarter period ID (for PTO save)
  const { data: quarterPeriodsData } = useQuarterPeriods();
  const currentQuarterPeriodId = useMemo(() => {
    if (!quarterPeriodsData?.data) return null;
    const now = new Date();
    const currentQ = Math.floor(now.getMonth() / 3) + 1;
    const currentLabel = `${now.getFullYear()}-Q${currentQ}`;
    const match = quarterPeriodsData.data.find((p: Period) => p.label === currentLabel);
    return match?.id ?? null;
  }, [quarterPeriodsData]);

  // Quarter date calculations
  const quarterDates = useMemo(() => {
    const now = new Date();
    const currentQ = Math.floor(now.getMonth() / 3);
    const currentYear = now.getFullYear();

    const currentQStart = new Date(currentYear, currentQ * 3, 1);
    const currentQEnd = new Date(currentYear, currentQ * 3 + 3, 0); // last day of quarter

    const nextQ = (currentQ + 1) % 4;
    const nextYear = currentQ === 3 ? currentYear + 1 : currentYear;
    const nextQStart = new Date(nextYear, nextQ * 3, 1);
    const nextQEnd = new Date(nextYear, nextQ * 3 + 3, 0);

    const qLabel = (q: number, y: number) => `Q${q + 1} ${y}`;

    return {
      currentQStart: currentQStart.toISOString().split('T')[0],
      currentQEnd: currentQEnd.toISOString().split('T')[0],
      nextQStart: nextQStart.toISOString().split('T')[0],
      nextQEnd: nextQEnd.toISOString().split('T')[0],
      currentLabel: qLabel(currentQ, currentYear),
      nextLabel: qLabel(nextQ, nextYear),
    };
  }, []);

  // Derive employee IDs from API data (before state mapping) so we can batch-fetch PTO
  const apiEmployeeIds = useMemo(
    () => (employeesData?.data || []).map((e) => e.id),
    [employeesData]
  );

  // Fetch PTO hours for all employees
  const { data: ptoHoursMap } = useEmployeePtoHours(
    apiEmployeeIds,
    quarterDates.currentQStart,
    quarterDates.currentQEnd,
    quarterDates.nextQStart,
    quarterDates.nextQEnd
  );

  // State
  const [employees, setEmployees] = useState<CapacityEmployee[]>([]);
  const [settings, setSettings] = useState<CapacitySettings>({
    defaultHoursPerWeek: 40,
    ktloPercentage: 15,
    meetingOverheadPercentage: 10,
    holidays: DEFAULT_HOLIDAYS.map(h => h.date),
  });
  const [holidays, setHolidays] = useState<Holiday[]>(DEFAULT_HOLIDAYS);

  // Update employees when API data or PTO data changes
  useEffect(() => {
    if (employeesData?.data) {
      setEmployees(employeesData.data.map((e, i) =>
        mapEmployeeToCapacity(
          e,
          i,
          ptoHoursMap?.[e.id]?.currentQuarterPtoHours
        )
      ));
    }
  }, [employeesData, ptoHoursMap]);

  // Employee IDs from state (for allocation summaries)
  const employeeIds = useMemo(
    () => employees.map((e) => e.id),
    [employees]
  );

  // Fetch allocation summaries for all loaded employees
  const { data: allocationSummaries } = useEmployeeAllocationSummaries(
    employeeIds,
    quarterDates.currentQStart,
    quarterDates.currentQEnd,
    quarterDates.nextQStart,
    quarterDates.nextQEnd
  );

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [slideOverEmployee, setSlideOverEmployee] = useState<CapacityEmployee | null | 'new'>(null);
  const [slideOverTab, setSlideOverTab] = useState<'details' | 'assignments' | 'org-relationships'>('details');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    let result = employees;
    // Filter by org membership
    if (orgMemberEmployeeIds) {
      result = result.filter((e) => orgMemberEmployeeIds.has(e.id));
    }
    // Filter by search
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(lower) ||
        e.role.toLowerCase().includes(lower) ||
        e.department.toLowerCase().includes(lower) ||
        e.skills.some(s => s.name.toLowerCase().includes(lower)) ||
        e.domains.some(d => d.name.toLowerCase().includes(lower))
      );
    }
    return result;
  }, [employees, search, orgMemberEmployeeIds]);

  // Handlers
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredEmployees.map(e => e.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [filteredEmployees]);

  const handleSelectEmployee = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSaveEmployee = useCallback(async (data: Partial<CapacityEmployee>) => {
    // Map frontend fields to backend API fields
    const apiData = {
      name: data.name || '',
      role: data.role || 'Team Member',
      hoursPerWeek: data.hoursPerWeek || 40,
      employmentType: data.status === 'CONTRACTOR' ? 'CONTRACTOR' as const : 'FULL_TIME' as const,
    };

    try {
      let employeeId: string | undefined;

      if (slideOverEmployee === 'new') {
        const result = await createEmployee.mutateAsync(apiData);
        employeeId = result.id;
      } else if (slideOverEmployee) {
        await updateEmployee.mutateAsync({
          id: slideOverEmployee.id,
          data: apiData,
        });
        employeeId = slideOverEmployee.id;
      }

      // Sync domains
      if (employeeId && data.domains) {
        const { domains: currentDomains } = await api.get<{
          domains: Array<{ id: string; name: string; proficiency: number }>;
        }>(`/employees/${employeeId}/domains`);

        const formDomains = data.domains;
        const formDomainNames = new Set(formDomains.map(d => d.name));
        const currentDomainMap = new Map(currentDomains.map(d => [d.name, d]));

        // Add new domains
        for (const fd of formDomains) {
          if (!currentDomainMap.has(fd.name)) {
            await api.post(`/employees/${employeeId}/domains`, {
              name: fd.name,
              proficiency: fd.proficiency,
            });
          }
        }

        // Remove deleted domains
        for (const cd of currentDomains) {
          if (!formDomainNames.has(cd.name)) {
            await api.delete(`/employees/${employeeId}/domains/${cd.id}`);
          }
        }

        // Update proficiency changes
        for (const fd of formDomains) {
          const current = currentDomainMap.get(fd.name);
          if (current && current.proficiency !== fd.proficiency) {
            await api.put(`/employees/${employeeId}/domains/${current.id}`, {
              proficiency: fd.proficiency,
            });
          }
        }

        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }

      // Persist PTO hours to capacity calendar
      if (employeeId && currentQuarterPeriodId && data.ptoHours !== undefined) {
        await api.put(`/employees/${employeeId}/capacity`, {
          entries: [
            { periodId: currentQuarterPeriodId, hoursAvailable: data.ptoHours },
          ],
        });
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
    } catch {
      // Errors already handled by mutation hooks' onError callbacks
    }

    setSlideOverEmployee(null);
  }, [slideOverEmployee, createEmployee, updateEmployee, queryClient, currentQuarterPeriodId]);

  const handleAddHoliday = useCallback(() => {
    if (!newHolidayDate) return;
    const date = new Date(newHolidayDate);
    const holiday: Holiday = {
      date,
      name: newHolidayName || 'Holiday',
    };
    setHolidays(prev => [...prev, holiday].sort((a, b) => a.date.getTime() - b.date.getTime()));
    setSettings(prev => ({
      ...prev,
      holidays: [...prev.holidays, date],
    }));
    setNewHolidayDate('');
    setNewHolidayName('');
  }, [newHolidayDate, newHolidayName]);

  const handleRemoveHoliday = useCallback((date: Date) => {
    setHolidays(prev => prev.filter(h => h.date.getTime() !== date.getTime()));
    setSettings(prev => ({
      ...prev,
      holidays: prev.holidays.filter(d => d.getTime() !== date.getTime()),
    }));
  }, []);

  const getStatusBadge = (status: CapacityEmployee['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge-success">Active</span>;
      case 'ON_LEAVE':
        return <span className="badge-warning">On Leave</span>;
      case 'CONTRACTOR':
        return <span className="badge-accent">Contractor</span>;
    }
  };

  const allSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedIds.has(e.id));
  const someSelected = filteredEmployees.some(e => selectedIds.has(e.id));

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Capacity Setup</h1>
          <p className="page-subtitle">Manage team members, skills, and capacity settings</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={orgNodeFilter}
            onChange={(e) => setOrgNodeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white"
          >
            <option value="">All Org Units</option>
            {flatNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {'\u00A0\u00A0'.repeat(node.depth)}{node.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Import CSV
          </button>
          <button
            className="btn-primary"
            onClick={() => setSlideOverEmployee('new')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
            </svg>
            Add Employee
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Employees */}
        <div className="xl:col-span-2 space-y-6">
          {/* Employees Card */}
          <div className="card">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between gap-4">
              <h2 className="font-display font-semibold text-surface-900">Employees</h2>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search team..."
                className="w-64"
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="w-10 px-4 py-3">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Skills</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Hours/Week</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">{quarterDates.currentLabel}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">{quarterDates.nextLabel}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredEmployees.map((employee, index) => (
                    <tr
                      key={employee.id}
                      className="hover:bg-surface-50 transition-colors cursor-pointer group"
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => { setSlideOverEmployee(employee); setSlideOverTab('details'); }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(employee.id)}
                          onChange={(e) => handleSelectEmployee(employee.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br ${employee.avatarColor} flex items-center justify-center shadow-sm`}>
                            <span className="text-xs font-semibold text-white">
                              {employee.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-surface-900 truncate">{employee.name}</p>
                            <p className="text-xs text-surface-500 truncate">{employee.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-surface-700">{employee.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-[200px]">
                          {employee.skills.slice(0, 2).map(skill => (
                            <span key={skill.name} className="badge-default flex items-center gap-1">
                              {skill.name}
                              <span className="text-amber-500">{'★'.repeat(skill.proficiency)}</span>
                            </span>
                          ))}
                          {employee.skills.length > 2 && (
                            <span className="text-xs text-surface-500">+{employee.skills.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-[200px]">
                          {employee.domains.slice(0, 2).map(domain => (
                            <span key={domain.name} className="badge-default flex items-center gap-1">
                              {domain.name}
                              <span className="text-amber-500">{'★'.repeat(domain.proficiency)}</span>
                            </span>
                          ))}
                          {employee.domains.length > 2 && (
                            <span className="text-xs text-surface-500">+{employee.domains.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-surface-700 tabular-nums">{employee.hoursPerWeek}h</span>
                      </td>
                      <td className="px-4 py-3">
                        <AllocationBadge percentage={allocationSummaries?.[employee.id]?.currentQuarterPct ?? 0} />
                      </td>
                      <td className="px-4 py-3">
                        <AllocationBadge percentage={allocationSummaries?.[employee.id]?.nextQuarterPct ?? 0} />
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(employee.status)}
                      </td>
                      <td className="px-4 py-3">
                        <svg
                          className="w-5 h-5 text-surface-400 group-hover:text-surface-600 transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-surface-200 flex items-center justify-between text-sm text-surface-500">
              <span>{filteredEmployees.length} employees</span>
              {selectedIds.size > 0 && (
                <span className="text-accent-700 font-medium">{selectedIds.size} selected</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Settings & Preview */}
        <div className="space-y-6">
          {/* Effective Capacity Preview */}
          <EffectiveCapacityPreview
            employees={employees}
            settings={settings}
            holidays={holidays}
            quarterDates={quarterDates}
          />

          {/* Capacity Settings */}
          <div className="card">
            <div className="px-5 py-4 border-b border-surface-200">
              <h2 className="font-display font-semibold text-surface-900">Capacity Settings</h2>
            </div>

            <div className="p-5 space-y-6">
              {/* Default Hours */}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Default Hours/Week</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={settings.defaultHoursPerWeek}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultHoursPerWeek: Number(e.target.value) }))}
                    className="input w-24 font-mono"
                    min={0}
                    max={60}
                  />
                  <span className="text-sm text-surface-500">hours for new employees</span>
                </div>
              </div>

              {/* KTLO Slider */}
              <Slider
                value={settings.ktloPercentage}
                onChange={(v) => setSettings(prev => ({ ...prev, ktloPercentage: v }))}
                min={0}
                max={50}
                label="KTLO Allocation"
              />
              <p className="text-xs text-surface-500 -mt-4">
                Keep-the-lights-on: maintenance, bugs, support
              </p>

              {/* Meeting Overhead Slider */}
              <Slider
                value={settings.meetingOverheadPercentage}
                onChange={(v) => setSettings(prev => ({ ...prev, meetingOverheadPercentage: v }))}
                min={0}
                max={40}
                label="Meeting Overhead"
              />
              <p className="text-xs text-surface-500 -mt-4">
                Standups, planning, reviews, 1:1s
              </p>
            </div>
          </div>

          {/* Holiday Calendar */}
          <div className="card">
            <div className="px-5 py-4 border-b border-surface-200">
              <h2 className="font-display font-semibold text-surface-900">Holiday Calendar</h2>
            </div>

            <div className="p-5 space-y-4">
              {/* Add Holiday */}
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="input flex-1"
                />
                <input
                  type="text"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="Name"
                  className="input flex-1"
                />
                <button
                  onClick={handleAddHoliday}
                  disabled={!newHolidayDate}
                  className="btn-secondary"
                >
                  Add
                </button>
              </div>

              {/* Holidays List */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {holidays.map((holiday) => (
                  <div
                    key={holiday.date.toISOString()}
                    className="flex items-center justify-between p-2.5 bg-surface-50 rounded-lg group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 flex flex-col items-center justify-center bg-white rounded-md border border-surface-200 shadow-subtle">
                        <span className="text-[10px] font-semibold text-accent-600 uppercase leading-none">
                          {holiday.date.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span className="text-sm font-bold text-surface-900 leading-none">
                          {holiday.date.getDate()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-surface-700">{holiday.name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveHoliday(holiday.date)}
                      className="p-1.5 rounded text-surface-400 hover:text-danger hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Slide-over */}
      <SlideOver
        isOpen={slideOverEmployee !== null}
        onClose={() => { setSlideOverEmployee(null); setSlideOverTab('details'); }}
        title={slideOverEmployee === 'new' ? 'Add Employee' : slideOverEmployee?.name || ''}
      >
        {/* Tab bar — only for existing employees */}
        {slideOverEmployee !== null && slideOverEmployee !== 'new' && (
          <div className="flex border-b border-surface-200 px-6">
            <button
              onClick={() => setSlideOverTab('details')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                slideOverTab === 'details'
                  ? 'border-accent-500 text-accent-700'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setSlideOverTab('assignments')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                slideOverTab === 'assignments'
                  ? 'border-accent-500 text-accent-700'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              Assignments
            </button>
            {matrixOrgEnabled && (
              <button
                onClick={() => setSlideOverTab('org-relationships')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  slideOverTab === 'org-relationships'
                    ? 'border-accent-500 text-accent-700'
                    : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
                }`}
              >
                Org Relationships
              </button>
            )}
          </div>
        )}

        {slideOverTab === 'details' || slideOverEmployee === 'new' ? (
          <EmployeeForm
            employee={slideOverEmployee === 'new' ? null : slideOverEmployee}
            onSave={handleSaveEmployee}
            onCancel={() => setSlideOverEmployee(null)}
          />
        ) : slideOverTab === 'org-relationships' && slideOverEmployee && slideOverEmployee !== 'new' ? (
          <EmployeeOrgRelationships employeeId={slideOverEmployee.id} />
        ) : slideOverEmployee && slideOverEmployee !== 'new' ? (
          <EmployeeAssignments
            employeeId={slideOverEmployee.id}
            allocationSummary={allocationSummaries?.[slideOverEmployee.id]}
            quarterLabels={{ current: quarterDates.currentLabel, next: quarterDates.nextLabel }}
          />
        ) : null}
      </SlideOver>
    </div>
  );
}
