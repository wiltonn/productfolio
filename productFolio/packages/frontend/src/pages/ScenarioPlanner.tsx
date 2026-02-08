import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SearchInput, StatusBadge, Checkbox, Modal, Select } from '../components/ui';
import { OriginBadge } from '../components/OriginBadge';
import type { SelectOption } from '../components/ui';
import {
  useScenario,
  useScenarioAllocations,
  useScenarioAnalysis,
  useUpdatePriorities,
  useCreateAllocation,
  useUpdateAllocation,
  useDeleteAllocation,
  useInitiativeAllocations,
  useAutoAllocatePreview,
  useAutoAllocateApply,
  useTransitionScenarioStatus,
  useScenarioPermissions,
  useSetPrimary,
  useUpdateScenario,
  scenarioKeys,
} from '../hooks/useScenarios';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Allocation, AutoAllocateResult, Scenario } from '../hooks/useScenarios';
import { useInitiatives } from '../hooks/useInitiatives';
import { useEmployees } from '../hooks/useEmployees';
import type { InitiativeStatus, InitiativeOrigin, Initiative, ScenarioStatus } from '../types';
import { usePlanningModeToggle, type PlanningMode } from '../hooks/usePlanningMode';
import { useFeatureFlag } from '../hooks/useFeatureFlags';

const LOCKED_STATUSES = ['IN_EXECUTION', 'COMPLETE'];

// ============================================================================
// TYPES
// ============================================================================

interface InitiativeForPlanning {
  id: string;
  title: string;
  quarter: string;
  status: InitiativeStatus;
  origin: InitiativeOrigin;
  totalHours: number;
  demandBySkill: Record<string, number>;
  hasShortage: boolean;
}

interface CapacityByWeek {
  weekLabel: string;    // "Week 1", "Week 2", ... "Week 13"
  weekStart: Date;
  weekEnd: Date;
  capacity: number;     // total employee hours for this week
  demand: number;       // allocated hours overlapping this week
  gap: number;          // capacity - demand
}

interface CapacityBySkill {
  skill: string;
  capacity: number;
  demand: number;
  gap: number;
}

interface CapacityByTeam {
  team: string;
  capacity: number;
  demand: number;
  gap: number;
}

interface AllocationRow {
  id: string;
  employeeId: string;
  employeeName: string;
  initiativeId: string;
  initiativeTitle: string;
  initiativeStatus: string | null;
  allocationType: string;
  startDate: string;
  endDate: string;
  percentage: number;
  rampModifier?: number;
  isOverallocated: boolean;
}

interface ScenarioAssumptions {
  allocationCap: number;
  bufferPercentage: number;
  ktloPercentage: number;
  meetingOverheadPercentage: number;
  rampEnabled: boolean;
}

// Default holidays – must stay in sync with Capacity.tsx
const DEFAULT_HOLIDAYS: Date[] = [
  new Date(2026, 0, 1),   // New Year's Day
  new Date(2026, 0, 19),  // MLK Day
  new Date(2026, 1, 16),  // Presidents' Day
  new Date(2026, 4, 25),  // Memorial Day
  new Date(2026, 6, 3),   // Independence Day (Observed)
  new Date(2026, 8, 7),   // Labor Day
  new Date(2026, 10, 26), // Thanksgiving
  new Date(2026, 11, 25), // Christmas
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Transform API Initiative to planning format
function transformInitiativeForPlanning(
  initiative: Initiative,
  capacityAnalysis: CapacityBySkill[]
): InitiativeForPlanning {
  // Calculate total hours from scope items
  const totalHours = initiative.scopeItems?.reduce((sum, item) =>
    sum + (item.estimateP50 || 0), 0
  ) ?? 0;

  // Aggregate skill demand from scope items
  const demandBySkill: Record<string, number> = {};
  initiative.scopeItems?.forEach(item => {
    if (item.skillDemand) {
      Object.entries(item.skillDemand as Record<string, number>).forEach(([skill, hours]) => {
        demandBySkill[skill] = (demandBySkill[skill] || 0) + hours;
      });
    }
  });

  // Check if any required skill has shortage
  const hasShortage = Object.keys(demandBySkill).some(skill => {
    const analysis = capacityAnalysis.find(a => a.skill === skill);
    return analysis && analysis.gap < 0;
  });

  return {
    id: initiative.id,
    title: initiative.title,
    quarter: initiative.targetQuarter || 'Unassigned',
    status: initiative.status,
    origin: initiative.origin,
    totalHours,
    demandBySkill,
    hasShortage,
  };
}

// Calculate capacity by week from employees and allocations
function calculateCapacityByWeek(
  employees: Array<{ id: string; hoursPerWeek: number }>,
  allocations: Array<{ employeeId: string; startDate: string; endDate: string; percentage: number }>,
  periodStart: Date,
  periodEnd: Date
): CapacityByWeek[] {
  const weeks: CapacityByWeek[] = [];

  // Align to Monday of the week containing periodStart
  const firstMonday = new Date(periodStart);
  const dayOfWeek = firstMonday.getDay(); // 0=Sun, 1=Mon
  if (dayOfWeek !== 1) {
    // Go back to the most recent Monday
    firstMonday.setDate(firstMonday.getDate() - ((dayOfWeek + 6) % 7));
  }

  // Total weekly capacity across all employees
  const totalWeeklyCapacity = employees.reduce((sum, e) => sum + (e.hoursPerWeek || 40), 0);

  // Build employee set for quick lookup
  const employeeSet = new Set(employees.map(e => e.id));

  let weekStart = new Date(firstMonday);
  let weekNum = 1;

  while (weekStart < periodEnd && weekNum <= 14) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    // Calculate demand for this week from overlapping allocations
    let weekDemand = 0;
    const weekStartTime = weekStart.getTime();
    const weekEndTime = weekEnd.getTime();

    for (const alloc of allocations) {
      if (!employeeSet.has(alloc.employeeId)) continue;

      const allocStart = new Date(alloc.startDate).getTime();
      const allocEnd = new Date(alloc.endDate).getTime();

      // Check overlap
      if (allocStart <= weekEndTime && allocEnd >= weekStartTime) {
        // Calculate overlap fraction (for partial weeks at allocation boundaries)
        const overlapStart = Math.max(allocStart, weekStartTime);
        const overlapEnd = Math.min(allocEnd, weekEndTime);
        const overlapDays = Math.max(0, (overlapEnd - overlapStart) / (24 * 60 * 60 * 1000) + 1);
        const weekFraction = Math.min(1, overlapDays / 7);

        // Find this employee's weekly hours
        const emp = employees.find(e => e.id === alloc.employeeId);
        const empWeeklyHours = emp?.hoursPerWeek || 40;

        weekDemand += empWeeklyHours * weekFraction * (alloc.percentage / 100);
      }
    }

    weekDemand = Math.round(weekDemand);

    weeks.push({
      weekLabel: `Week ${weekNum}`,
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      capacity: totalWeeklyCapacity,
      demand: weekDemand,
      gap: totalWeeklyCapacity - weekDemand,
    });

    weekStart.setDate(weekStart.getDate() + 7);
    weekNum++;
  }

  return weeks;
}

// Calculate capacity by team (simplified - group by first skill)
function calculateCapacityByTeam(employees: Array<{ skills: string[]; hoursPerWeek: number }>): CapacityByTeam[] {
  const teams: Record<string, { capacity: number; count: number }> = {};

  employees.forEach(emp => {
    const team = emp.skills?.[0] || 'General';
    if (!teams[team]) {
      teams[team] = { capacity: 0, count: 0 };
    }
    teams[team].capacity += (emp.hoursPerWeek || 40) * 13; // Quarter
    teams[team].count++;
  });

  return Object.entries(teams).map(([team, data]) => ({
    team,
    capacity: data.capacity,
    demand: Math.round(data.capacity * 0.85), // Placeholder
    gap: Math.round(data.capacity * 0.15),
  }));
}


// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

// Resizable Panel Divider
function PanelDivider({
  orientation,
  onResize,
}: {
  orientation: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = orientation === 'horizontal' ? e.clientX : e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = orientation === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [orientation, onResize]);

  return (
    <div
      className={`
        ${orientation === 'horizontal' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}
        ${isDragging ? 'bg-accent-400' : 'bg-surface-200 hover:bg-accent-300'}
        transition-colors duration-150 relative group flex-shrink-0
      `}
      onMouseDown={handleMouseDown}
    >
      <div className={`
        absolute ${orientation === 'horizontal' ? 'inset-y-0 -left-1 -right-1' : 'inset-x-0 -top-1 -bottom-1'}
      `} />
      {/* Grip indicator */}
      <div className={`
        absolute ${orientation === 'horizontal' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex-col' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex-row'}
        flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity
      `}>
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1 h-1 rounded-full bg-surface-400" />
        ))}
      </div>
    </div>
  );
}

// Sortable Initiative Card
function SortableInitiativeCard({
  initiative,
  rank,
  isSelected,
  onSelect,
}: {
  initiative: InitiativeForPlanning;
  rank: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: initiative.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        initiative-card group relative cursor-pointer
        ${isDragging ? 'z-50 shadow-xl ring-2 ring-accent-400' : ''}
        ${isSelected ? 'ring-2 ring-accent-500 bg-accent-50' : ''}
        ${initiative.hasShortage ? 'shortage' : ''}
      `}
      {...attributes}
      onClick={() => onSelect(initiative.id)}
    >
      {/* Rank indicator */}
      <div className="rank-badge">
        {rank}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 ml-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-surface-900 truncate">{initiative.title}</h4>
          {LOCKED_STATUSES.includes(initiative.status) && (
            <svg className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
          )}
          {initiative.hasShortage && (
            <span className="shortage-indicator" title="Resource shortage">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span
            className="quarter-badge"
            title={initiative.quarter === 'Unassigned' ? 'This initiative has no target quarter set. Assign one in the initiative details.' : undefined}
          >
            {initiative.quarter}
          </span>
          <span className="hours-badge">{initiative.totalHours.toLocaleString()}h</span>
          <StatusBadge status={initiative.status} />
          <OriginBadge origin={initiative.origin} />
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="drag-handle"
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
        </svg>
      </div>
    </div>
  );
}

// Capacity Bar Chart (weekly bars for the quarter)
function CapacityBarChart({ data }: { data: CapacityByWeek[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxValue = Math.max(...data.flatMap(d => [d.capacity, d.demand]), 1);

  const formatDate = (d: Date) => {
    const month = d.toLocaleString('default', { month: 'short' });
    return `${month} ${d.getDate()}`;
  };

  return (
    <div className="capacity-chart">
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-dot capacity" />
          <span>Capacity</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot demand" />
          <span>Demand</span>
        </div>
      </div>
      <div className="chart-bars weekly">
        {data.map((item, i) => {
          const capacityHeight = (item.capacity / maxValue) * 100;
          const demandHeight = (item.demand / maxValue) * 100;
          const status = item.gap < 0 ? 'shortage' : item.gap < item.capacity * 0.1 ? 'tight' : 'ok';

          return (
            <div
              key={item.weekLabel}
              className="bar-group weekly"
              style={{ animationDelay: `${i * 30}ms` }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="bar-container weekly">
                <div className="bar capacity weekly-overlay" style={{ height: `${capacityHeight}%` }}>
                  <div className={`bar demand weekly-overlay ${status}`} style={{ height: `${item.capacity > 0 ? (item.demand / item.capacity) * 100 : 0}%` }}>
                    <div className="bar-glow" />
                  </div>
                </div>
              </div>
              <div className="bar-label weekly">{item.weekLabel}</div>
              {hoveredIndex === i && (
                <div className="bar-tooltip">
                  <div className="bar-tooltip-header">
                    {item.weekLabel}: {formatDate(item.weekStart)} – {formatDate(item.weekEnd)}
                  </div>
                  <div className="bar-tooltip-row">
                    <span>Capacity</span>
                    <span className="font-semibold">{item.capacity}h</span>
                  </div>
                  <div className="bar-tooltip-row">
                    <span>Demand</span>
                    <span className="font-semibold">{item.demand}h</span>
                  </div>
                  <div className={`bar-tooltip-row ${status}`}>
                    <span>Gap</span>
                    <span className="font-semibold">{item.gap >= 0 ? '+' : ''}{item.gap}h</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Skill Capacity Chart (horizontal bars)
function SkillCapacityChart({ data }: { data: CapacityBySkill[] }) {
  const maxValue = Math.max(...data.flatMap(d => [d.capacity, d.demand]));

  return (
    <div className="skill-chart">
      {data.map((item, i) => {
        const capacityWidth = (item.capacity / maxValue) * 100;
        const demandWidth = (item.demand / maxValue) * 100;
        const utilizationPercent = Math.round((item.demand / item.capacity) * 100);
        const status = item.gap < 0 ? 'shortage' : utilizationPercent > 90 ? 'tight' : 'ok';

        return (
          <div
            key={item.skill}
            className="skill-row"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="skill-label">
              <span className="skill-name">{item.skill}</span>
              <span className={`skill-stats ${status}`}>
                {item.demand.toLocaleString()}/{item.capacity.toLocaleString()}h
                <span className="utilization">({utilizationPercent}%)</span>
              </span>
            </div>
            <div className="skill-bars">
              <div className="skill-bar-track">
                <div
                  className="skill-bar capacity"
                  style={{ width: `${capacityWidth}%` }}
                />
                <div
                  className={`skill-bar demand ${status}`}
                  style={{ width: `${demandWidth}%` }}
                />
              </div>
              {item.gap < 0 && (
                <span className="gap-indicator">
                  {item.gap}h
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Team Capacity Chart
function TeamCapacityChart({ data }: { data: CapacityByTeam[] }) {
  return (
    <div className="team-chart">
      {data.map((item, i) => {
        const utilizationPercent = Math.round((item.demand / item.capacity) * 100);
        const status = item.gap < 0 ? 'shortage' : utilizationPercent > 90 ? 'tight' : 'ok';

        return (
          <div
            key={item.team}
            className="team-card"
            style={{ animationDelay: `${i * 75}ms` }}
          >
            <div className="team-header">
              <span className="team-name">{item.team}</span>
              <span className={`team-status ${status}`}>
                {status === 'shortage' ? 'Over capacity' : status === 'tight' ? 'Near limit' : 'Available'}
              </span>
            </div>
            <div className="team-gauge">
              <svg viewBox="0 0 100 50" className="gauge-svg">
                {/* Background arc */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="gauge-bg"
                />
                {/* Value arc */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={`${Math.min(utilizationPercent, 100) * 1.26} 126`}
                  strokeLinecap="round"
                  className={`gauge-value ${status}`}
                />
              </svg>
              <div className="gauge-label">
                <span className="gauge-percent">{utilizationPercent}%</span>
                <span className="gauge-sublabel">utilized</span>
              </div>
            </div>
            <div className="team-details">
              <div className="team-stat">
                <span className="stat-label">Capacity</span>
                <span className="stat-value">{item.capacity.toLocaleString()}h</span>
              </div>
              <div className="team-stat">
                <span className="stat-label">Demand</span>
                <span className="stat-value">{item.demand.toLocaleString()}h</span>
              </div>
              <div className="team-stat">
                <span className="stat-label">Gap</span>
                <span className={`stat-value ${status}`}>
                  {item.gap >= 0 ? '+' : ''}{item.gap}h
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Inline Editable Input
function InlineEdit({
  value,
  onChange,
  type = 'text',
  className = '',
}: {
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'number';
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue !== String(value)) {
      onChange(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditValue(String(value));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`inline-edit-input ${className}`}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`inline-edit-display ${className}`}
    >
      {value}
    </span>
  );
}

// Initiative Allocation Panel
function InitiativeAllocationPanel({
  scenarioId,
  initiativeId,
  initiativeTitle,
  employees,
  onClose,
  defaultDates,
  readOnly,
}: {
  scenarioId: string;
  initiativeId: string;
  initiativeTitle: string;
  employees: SelectOption[];
  onClose: () => void;
  defaultDates: { startDate: string; endDate: string };
  readOnly?: boolean;
}) {
  const { data: allocations, isLoading } = useInitiativeAllocations(scenarioId, initiativeId);
  const createAllocation = useCreateAllocation();
  const updateAllocation = useUpdateAllocation();
  const deleteAllocation = useDeleteAllocation();

  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newStartDate, setNewStartDate] = useState(defaultDates.startDate);
  const [newEndDate, setNewEndDate] = useState(defaultDates.endDate);
  const [newPercentage, setNewPercentage] = useState(100);

  // Get initiative status from first allocation
  const firstAlloc = allocations?.[0] as Allocation | undefined;
  const initiativeStatus = firstAlloc?.initiativeStatus ?? null;
  const isInitiativeLocked = initiativeStatus !== null && LOCKED_STATUSES.includes(initiativeStatus);
  const isLocked = isInitiativeLocked || readOnly;

  const handleAdd = useCallback(() => {
    if (!newEmployeeId) return;
    createAllocation.mutate({
      scenarioId,
      data: {
        employeeId: newEmployeeId,
        initiativeId,
        startDate: newStartDate,
        endDate: newEndDate,
        percentage: newPercentage,
      },
    }, {
      onSuccess: () => {
        setNewEmployeeId('');
        setNewPercentage(100);
      },
    });
  }, [scenarioId, initiativeId, newEmployeeId, newStartDate, newEndDate, newPercentage, createAllocation]);

  const handleUpdate = useCallback((allocationId: string, field: string, value: string) => {
    const data: Record<string, string | number> = {};
    if (field === 'startDate' || field === 'endDate') {
      data[field] = value;
    } else if (field === 'percentage') {
      data[field] = Number(value);
    }
    updateAllocation.mutate({ scenarioId, allocationId, data });
  }, [scenarioId, updateAllocation]);

  const handleDelete = useCallback((allocationId: string) => {
    deleteAllocation.mutate({ scenarioId, allocationId });
  }, [scenarioId, deleteAllocation]);

  return (
    <div className="flex flex-col h-full">
      {/* Panel header with initiative accent bar */}
      <div className="border-b border-surface-200 bg-accent-50 border-l-4 border-l-accent-500">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="font-semibold text-surface-900 truncate">{initiativeTitle}</h4>
            {isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-full flex-shrink-0">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                Locked
              </span>
            )}
            {initiativeStatus && <StatusBadge status={initiativeStatus as InitiativeStatus} />}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-surface-400 hover:text-surface-600 rounded transition-colors flex-shrink-0"
            title="Back to all allocations"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Allocations table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-surface-500 text-sm">Loading...</div>
        ) : (
          <table className="allocations-table w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Start</th>
                <th>End</th>
                <th>% Allocation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allocations?.map((alloc) => (
                <tr key={alloc.id}>
                  <td>
                    <div className="employee-cell">
                      <div className="employee-avatar">
                        {alloc.employeeName.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span>{alloc.employeeName}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full ${
                      (alloc as unknown as { allocationType?: string }).allocationType === 'RUN' ? 'bg-emerald-100 text-emerald-700'
                        : (alloc as unknown as { allocationType?: string }).allocationType === 'SUPPORT' ? 'bg-purple-100 text-purple-700'
                        : 'bg-surface-100 text-surface-600'
                    }`}>
                      {(alloc as unknown as { allocationType?: string }).allocationType || 'PROJECT'}
                    </span>
                  </td>
                  <td>
                    {isLocked ? (
                      <span className="text-surface-500">{alloc.startDate.toString().split('T')[0]}</span>
                    ) : (
                      <InlineEdit
                        value={alloc.startDate.toString().split('T')[0]}
                        onChange={(v) => handleUpdate(alloc.id, 'startDate', v)}
                        type="date"
                      />
                    )}
                  </td>
                  <td>
                    {isLocked ? (
                      <span className="text-surface-500">{alloc.endDate.toString().split('T')[0]}</span>
                    ) : (
                      <InlineEdit
                        value={alloc.endDate.toString().split('T')[0]}
                        onChange={(v) => handleUpdate(alloc.id, 'endDate', v)}
                        type="date"
                      />
                    )}
                  </td>
                  <td>
                    <div className="percentage-cell">
                      {isLocked ? (
                        <span className="text-surface-500">{alloc.percentage}</span>
                      ) : (
                        <InlineEdit
                          value={alloc.percentage}
                          onChange={(v) => handleUpdate(alloc.id, 'percentage', v)}
                          type="number"
                          className="percentage-input"
                        />
                      )}
                      <span>%</span>
                    </div>
                  </td>
                  <td>
                    {!isLocked && (
                      <button
                        onClick={() => handleDelete(alloc.id)}
                        className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete allocation"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(!allocations || allocations.length === 0) && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-surface-400 text-sm">
                    No allocations for this initiative yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add allocation inline form */}
      {!isLocked && (
        <div className="px-4 py-3 border-t border-surface-200 bg-surface-50">
          <div className="text-xs font-medium text-accent-600 mb-2">
            Adding to: <span className="font-semibold">{initiativeTitle}</span>
          </div>
          <div className="flex items-center gap-2">
          <select
            value={newEmployeeId}
            onChange={(e) => setNewEmployeeId(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
          >
            <option value="">Select employee...</option>
            {employees.map(emp => (
              <option key={emp.value} value={emp.value}>{emp.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            className="w-32 px-2 py-1.5 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
          />
          <input
            type="date"
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="w-32 px-2 py-1.5 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
          />
          <input
            type="number"
            value={newPercentage}
            onChange={(e) => setNewPercentage(Number(e.target.value))}
            min={1}
            max={100}
            className="w-16 px-2 py-1.5 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
          />
          <span className="text-sm text-surface-500">%</span>
          <button
            onClick={handleAdd}
            disabled={!newEmployeeId || createAllocation.isPending}
            className="px-3 py-1.5 text-sm font-medium text-white bg-accent-600 rounded-md hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Guided Mode Overlay
function GuidedModeOverlay({
  step,
  onNext,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const steps = [
    {
      target: 'left-panel',
      title: 'Initiative Rankings',
      description: 'Drag and drop initiatives to set priorities. Higher ranked items get resources first.',
      position: 'right',
    },
    {
      target: 'right-panel',
      title: 'Capacity Visualization',
      description: 'See real-time capacity vs demand. Switch between Quarter, Skill, and Team views.',
      position: 'left',
    },
    {
      target: 'bottom-panel',
      title: 'Allocation Editor',
      description: 'Fine-tune individual allocations. Watch for overallocation warnings in red.',
      position: 'top',
    },
  ];

  const currentStep = steps[step];
  if (!currentStep) return null;

  return (
    <div className="guided-overlay">
      <div className="guided-backdrop" onClick={onSkip} />
      <div className={`guided-tooltip ${currentStep.position}`} data-target={currentStep.target}>
        <div className="guided-step-indicator">
          {steps.map((_, i) => (
            <div key={i} className={`step-dot ${i === step ? 'active' : i < step ? 'completed' : ''}`} />
          ))}
        </div>
        <h4 className="guided-title">{currentStep.title}</h4>
        <p className="guided-description">{currentStep.description}</p>
        <div className="guided-actions">
          <button onClick={onSkip} className="guided-skip">Skip tour</button>
          <button onClick={onNext} className="guided-next">
            {step === steps.length - 1 ? 'Got it!' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Compare Modal
function CompareModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Compare Scenarios</h3>
          <button onClick={onClose} className="modal-close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="compare-grid">
            <div className="compare-column current">
              <h4>Current Scenario</h4>
              <div className="compare-stat">
                <span className="label">Total Demand</span>
                <span className="value">3,160h</span>
              </div>
              <div className="compare-stat">
                <span className="label">Utilization</span>
                <span className="value">87%</span>
              </div>
              <div className="compare-stat shortage">
                <span className="label">Skill Gaps</span>
                <span className="value">3</span>
              </div>
            </div>
            <div className="compare-column baseline">
              <h4>Baseline (Q4 2025)</h4>
              <div className="compare-stat">
                <span className="label">Total Demand</span>
                <span className="value">2,840h</span>
                <span className="delta negative">+320h</span>
              </div>
              <div className="compare-stat">
                <span className="label">Utilization</span>
                <span className="value">78%</span>
                <span className="delta negative">+9%</span>
              </div>
              <div className="compare-stat">
                <span className="label">Skill Gaps</span>
                <span className="value">1</span>
                <span className="delta negative">+2</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STATUS COMPONENTS
// ============================================================================

const SCENARIO_STATUS_COLORS: Record<ScenarioStatus, { bg: string; text: string; label: string; tooltip: string }> = {
  DRAFT: { bg: 'bg-surface-100', text: 'text-surface-600', label: 'Draft', tooltip: 'Fully editable. Add allocations, set priorities, and configure assumptions.' },
  REVIEW: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Review', tooltip: 'Under stakeholder review. Allocations and priorities can still be adjusted.' },
  APPROVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved', tooltip: 'Allocations and priorities are frozen. Return to Review to make changes.' },
  LOCKED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Locked', tooltip: 'Fully immutable. No changes allowed. Baseline scenarios capture a snapshot at this point.' },
};

function ScenarioStatusBadge({ status }: { status: ScenarioStatus }) {
  const config = SCENARIO_STATUS_COLORS[status] || SCENARIO_STATUS_COLORS.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}
      title={config.tooltip}
    >
      {status === 'LOCKED' && (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
        </svg>
      )}
      {config.label}
    </span>
  );
}

function ScenarioStatusActions({
  scenario,
  onTransition,
  isPending,
  canTransition,
}: {
  scenario: Scenario;
  onTransition: (status: ScenarioStatus) => void;
  isPending: boolean;
  canTransition: boolean;
}) {
  if (!canTransition) return null;
  const { status } = scenario;

  return (
    <div className="flex items-center gap-2">
      {status === 'DRAFT' && (
        <button
          onClick={() => onTransition('REVIEW')}
          disabled={isPending}
          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
          title="Move to stakeholder review. You can still edit allocations and priorities in Review."
        >
          Submit for Review
        </button>
      )}
      {status === 'REVIEW' && (
        <>
          <button
            onClick={() => onTransition('DRAFT')}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
            title="Return to Draft for full editing."
          >
            Return to Draft
          </button>
          <button
            onClick={() => onTransition('APPROVED')}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
            title="Approve this plan. Allocations and priorities will be frozen."
          >
            Approve
          </button>
        </>
      )}
      {status === 'APPROVED' && (
        <>
          <button
            onClick={() => onTransition('REVIEW')}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
            title="Return to Review to make changes to allocations or priorities."
          >
            Return to Review
          </button>
          <button
            onClick={() => onTransition('LOCKED')}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
            title="Lock the plan permanently. No further changes will be allowed. Baseline scenarios will capture a snapshot."
          >
            Lock Plan
          </button>
        </>
      )}
      {status === 'LOCKED' && (
        <span className="text-xs text-surface-500 italic" title="This plan is fully locked and cannot be modified. Create a revision if mid-quarter changes are needed.">Plan is locked</span>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ScenarioPlanner() {
  const { id } = useParams<{ id: string }>();

  // API hooks
  const { data: scenario, isLoading: scenarioLoading } = useScenario(id || '');
  const { data: allocationsData, isLoading: allocationsLoading } = useScenarioAllocations(id || '');
  const { data: capacityAnalysis, isLoading: analysisLoading } = useScenarioAnalysis(id || '');
  const { data: initiativesData, isLoading: initiativesLoading } = useInitiatives({ limit: 100 });
  const { data: employeesData } = useEmployees({ limit: 100 });
  const transitionStatus = useTransitionScenarioStatus();
  const setPrimary = useSetPrimary();
  const updateScenario = useUpdateScenario();
  const queryClient = useQueryClient();
  const { canEdit, canTransition, canModifyAllocations, isReadOnly } = useScenarioPermissions(scenario as Scenario | undefined);
  const navigate = useNavigate();
  const planningModeToggle = usePlanningModeToggle();
  const { enabled: tokenFlowEnabled } = useFeatureFlag('token_planning_v1');
  const updatePriorities = useUpdatePriorities();
  const createAllocation = useCreateAllocation();
  const updateAllocation = useUpdateAllocation();
  const deleteAllocation = useDeleteAllocation();

  // Panel sizing state
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(280);
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);

  // Selected initiative for focused allocation view
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);

  // Local state for drag-and-drop ordering
  const [initiativeOrder, setInitiativeOrder] = useState<string[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Visualization state
  const [activeTab, setActiveTab] = useState<'quarter' | 'skill' | 'team'>('quarter');

  // Scenario state
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>({
    allocationCap: 100,
    bufferPercentage: 10,
    ktloPercentage: 15,
    meetingOverheadPercentage: 10,
    rampEnabled: false,
  });

  // Guided mode
  const [showGuidedMode, setShowGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);

  // Planning mode confirmation modal
  const [showPlanningModeConfirm, setShowPlanningModeConfirm] = useState(false);
  const [pendingPlanningMode, setPendingPlanningMode] = useState<PlanningMode | null>(null);
  const currentPlanningMode: PlanningMode = (scenario?.planningMode as PlanningMode) || 'LEGACY';

  // Auto-allocate hooks and state
  const autoAllocatePreview = useAutoAllocatePreview();
  const autoAllocateApply = useAutoAllocateApply();
  const [isAutoAllocateModalOpen, setIsAutoAllocateModalOpen] = useState(false);
  const [autoAllocateResult, setAutoAllocateResult] = useState<AutoAllocateResult | null>(null);

  // Add allocation modal state
  const [isAddAllocationModalOpen, setIsAddAllocationModalOpen] = useState(false);
  const [newAllocation, setNewAllocation] = useState({
    employeeId: '',
    initiativeId: '',
    allocationType: 'PROJECT' as string,
    startDate: '',
    endDate: '',
    percentage: 100,
  });

  // Transform API data to component formats
  const capacityBySkill: CapacityBySkill[] = useMemo(() => {
    if (!capacityAnalysis) return [];
    return capacityAnalysis.map(item => ({
      skill: item.skill,
      capacity: item.capacity,
      demand: item.demand,
      gap: item.gap,
    }));
  }, [capacityAnalysis]);

  const initiatives: InitiativeForPlanning[] = useMemo(() => {
    if (!initiativesData?.data) return [];

    const transformed = initiativesData.data.map(init =>
      transformInitiativeForPlanning(init, capacityBySkill)
    );

    // Sort by priority rankings from scenario if available
    if (scenario?.priorityRankings && initiativeOrder.length === 0) {
      const rankings = scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>;
      transformed.sort((a, b) => {
        const aRank = rankings.find(r => r.initiativeId === a.id)?.rank ?? 999;
        const bRank = rankings.find(r => r.initiativeId === b.id)?.rank ?? 999;
        return aRank - bRank;
      });
    } else if (initiativeOrder.length > 0) {
      // Use local order from drag-and-drop
      transformed.sort((a, b) => {
        const aIdx = initiativeOrder.indexOf(a.id);
        const bIdx = initiativeOrder.indexOf(b.id);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    }

    return transformed;
  }, [initiativesData, capacityBySkill, scenario, initiativeOrder]);

  const allocations: AllocationRow[] = useMemo(() => {
    if (!allocationsData || !employeesData?.data || !initiativesData?.data) return [];

    // Group allocations by employee to detect overallocations
    const employeeAllocations: Record<string, number> = {};
    allocationsData.forEach(alloc => {
      employeeAllocations[alloc.employeeId] = (employeeAllocations[alloc.employeeId] || 0) + alloc.percentage;
    });

    return allocationsData.map(alloc => {
      const employee = employeesData.data.find(e => e.id === alloc.employeeId);
      const initiative = initiativesData.data.find(i => i.id === alloc.initiativeId);

      return {
        id: alloc.id,
        employeeId: alloc.employeeId,
        employeeName: employee?.name || 'Unknown',
        initiativeId: alloc.initiativeId,
        initiativeTitle: initiative?.title || 'Unknown Initiative',
        initiativeStatus: alloc.initiativeStatus ?? null,
        allocationType: alloc.allocationType || 'PROJECT',
        startDate: alloc.startDate.split('T')[0],
        endDate: alloc.endDate.split('T')[0],
        percentage: alloc.percentage,
        rampModifier: alloc.rampModifier,
        isOverallocated: employeeAllocations[alloc.employeeId] > 100,
      };
    });
  }, [allocationsData, employeesData, initiativesData]);

  const capacityByWeek: CapacityByWeek[] = useMemo(() => {
    if (!employeesData?.data || !scenario?.periodStartDate || !scenario?.periodEndDate) return [];
    return calculateCapacityByWeek(
      employeesData.data.map(e => ({ id: e.id, hoursPerWeek: e.defaultCapacityHours })),
      allocationsData || [],
      new Date(scenario.periodStartDate),
      new Date(scenario.periodEndDate)
    );
  }, [employeesData, scenario, allocationsData]);

  const capacityByTeam: CapacityByTeam[] = useMemo(() => {
    if (!employeesData?.data) return [];
    return calculateCapacityByTeam(
      employeesData.data.map(e => ({
        skills: e.skills || [],
        hoursPerWeek: e.defaultCapacityHours,
      }))
    );
  }, [employeesData]);

  // Options for allocation modal dropdowns
  const employeeOptions: SelectOption[] = useMemo(() => {
    if (!employeesData?.data) return [];
    return employeesData.data.map(emp => ({
      value: emp.id,
      label: emp.name,
    }));
  }, [employeesData]);

  const initiativeOptions: SelectOption[] = useMemo(() => {
    if (!initiativesData?.data) return [];
    return initiativesData.data.map(init => ({
      value: init.id,
      label: init.title,
    }));
  }, [initiativesData]);

  // Compute default dates based on scenario's quarter period
  const defaultAllocationDates = useMemo(() => {
    if (scenario?.periodStartDate && scenario?.periodEndDate) {
      return {
        startDate: new Date(scenario.periodStartDate).toISOString().split('T')[0],
        endDate: new Date(scenario.periodEndDate).toISOString().split('T')[0],
      };
    }
    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    return {
      startDate: today.toISOString().split('T')[0],
      endDate: threeMonthsLater.toISOString().split('T')[0],
    };
  }, [scenario?.periodStartDate, scenario?.periodEndDate]);

  // Initialize initiative order from scenario priorities
  useEffect(() => {
    if (scenario?.priorityRankings && initiativeOrder.length === 0) {
      const rankings = scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>;
      const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
      setInitiativeOrder(sorted.map(r => r.initiativeId));
    }
  }, [scenario, initiativeOrder.length]);

  // Update assumptions from scenario
  useEffect(() => {
    if (scenario?.assumptions) {
      const a = scenario.assumptions as Record<string, unknown>;
      setAssumptions({
        allocationCap: (a.allocationCapPercentage as number) || 100,
        bufferPercentage: (a.bufferPercentage as number) || 10,
        ktloPercentage: (a.ktloPercentage as number) ?? 15,
        meetingOverheadPercentage: (a.meetingOverheadPercentage as number) ?? 10,
        rampEnabled: (a.rampEnabled as boolean) ?? false,
      });
    }
  }, [scenario]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter initiatives
  const filteredInitiatives = useMemo(() => {
    return initiatives.filter(init => {
      if (approvedOnly && init.status !== 'RESOURCING' && init.status !== 'IN_EXECUTION') {
        return false;
      }
      if (searchQuery) {
        return init.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [initiatives, approvedOnly, searchQuery]);

  // Net effective capacity – mirrors Capacity.tsx formula
  const netEffectiveCapacity = useMemo(() => {
    if (!employeesData?.data || !scenario?.periodStartDate || !scenario?.periodEndDate) return 0;

    const periodStart = new Date(scenario.periodStartDate);
    const periodEnd = new Date(scenario.periodEndDate);

    // Count working days (Mon–Fri) in the scenario period
    let workingDays = 0;
    const d = new Date(periodStart);
    while (d <= periodEnd) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) workingDays++;
      d.setDate(d.getDate() + 1);
    }

    const employees = employeesData.data;
    const totalWeeklyHours = employees.reduce((sum, e) => sum + (e.defaultCapacityHours || 40), 0);

    // Gross capacity: per-employee daily rate × working days
    const grossHours = employees.reduce(
      (sum, e) => sum + ((e.defaultCapacityHours || 40) / 5) * workingDays, 0
    );

    // Holidays that fall on weekdays within the scenario period
    const quarterHolidays = DEFAULT_HOLIDAYS.filter(hd => {
      const day = hd.getDay();
      return hd >= periodStart && hd <= periodEnd && day !== 0 && day !== 6;
    });
    const dailyTeamHours = totalWeeklyHours / 5;
    const holidayHours = quarterHolidays.length * dailyTeamHours;

    // Net available after holidays (PTO defaults to 0, same as Capacity.tsx default)
    const netAvailable = grossHours - holidayHours;

    // Deduct KTLO and meeting overhead
    const ktloHours = netAvailable * (assumptions.ktloPercentage / 100);
    const meetingHours = netAvailable * (assumptions.meetingOverheadPercentage / 100);

    return Math.round(netAvailable - ktloHours - meetingHours);
  }, [employeesData, scenario?.periodStartDate, scenario?.periodEndDate, assumptions.ktloPercentage, assumptions.meetingOverheadPercentage]);

  // Summary stats
  const stats = useMemo(() => {
    const totalDemand = initiatives.reduce((sum, i) => sum + i.totalHours, 0);
    const totalAvailableCapacity = netEffectiveCapacity;

    // Calculate used capacity from actual allocations
    let totalUsedCapacity = 0;
    if (allocationsData && employeesData?.data) {
      const employeeMap = new Map(employeesData.data.map(e => [e.id, e]));
      allocationsData.forEach(alloc => {
        const employee = employeeMap.get(alloc.employeeId);
        const hoursPerWeek = employee?.defaultCapacityHours || 40;
        const start = new Date(alloc.startDate);
        const end = new Date(alloc.endDate);
        const weeks = Math.max(0, (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
        totalUsedCapacity += hoursPerWeek * weeks * (alloc.percentage / 100);
      });
      totalUsedCapacity = Math.round(totalUsedCapacity);
    }

    const skillGaps = capacityBySkill.filter(s => s.gap < 0).length;
    const utilizationPercent = totalAvailableCapacity > 0 ? Math.round((totalUsedCapacity / totalAvailableCapacity) * 100) : 0;

    // Compute ramp cost from allocations
    let rampCostHours = 0;
    if (assumptions.rampEnabled && allocationsData && employeesData?.data) {
      const employeeMap = new Map(employeesData.data.map(e => [e.id, e]));
      allocationsData.forEach(alloc => {
        const rm = alloc.rampModifier ?? 1.0;
        if (rm < 1.0 && rm > 0) {
          const employee = employeeMap.get(alloc.employeeId);
          const hoursPerWeek = employee?.defaultCapacityHours || 40;
          const start = new Date(alloc.startDate);
          const end = new Date(alloc.endDate);
          const weeks = Math.max(0, (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
          const allocatedHours = hoursPerWeek * weeks * (alloc.percentage / 100);
          // Hours with ramp = allocatedHours * rm; lost = allocatedHours * (1 - rm)
          rampCostHours += allocatedHours * (1 - rm);
        }
      });
      rampCostHours = Math.round(rampCostHours);
    }

    return { totalDemand, totalAvailableCapacity, totalUsedCapacity, skillGaps, utilizationPercent, rampCostHours };
  }, [initiatives, netEffectiveCapacity, capacityBySkill, allocationsData, employeesData, assumptions.rampEnabled]);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (isReadOnly) return;

    if (over && active.id !== over.id) {
      const currentOrder = initiativeOrder.length > 0
        ? initiativeOrder
        : initiatives.map(i => i.id);

      const oldIndex = currentOrder.indexOf(String(active.id));
      const newIndex = currentOrder.indexOf(String(over.id));
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);

      setInitiativeOrder(newOrder);

      // Save to API
      if (id) {
        const priorities = newOrder.map((initiativeId, idx) => ({
          initiativeId,
          rank: idx + 1,
        }));
        updatePriorities.mutate({ scenarioId: id, priorities });
      }
    }
  }, [initiativeOrder, initiatives, id, updatePriorities]);

  // Allocation handlers
  const handleAllocationChange = useCallback((
    allocationId: string,
    field: keyof AllocationRow,
    value: string
  ) => {
    if (!id) return;
    const data: Record<string, string | number> = {};
    if (field === 'startDate' || field === 'endDate') {
      data[field] = value;
    } else if (field === 'percentage') {
      data[field] = Number(value);
    }
    updateAllocation.mutate({
      scenarioId: id,
      allocationId,
      data,
    });
  }, [id, updateAllocation]);

  const handleDeleteAllocation = useCallback((allocationId: string) => {
    if (!id) return;
    deleteAllocation.mutate({
      scenarioId: id,
      allocationId,
    });
  }, [id, deleteAllocation]);

  const handleCreateAllocation = useCallback(() => {
    if (!id || !newAllocation.employeeId) return;
    createAllocation.mutate({
      scenarioId: id,
      data: {
        employeeId: newAllocation.employeeId,
        initiativeId: newAllocation.initiativeId || undefined,
        allocationType: newAllocation.allocationType,
        startDate: newAllocation.startDate || defaultAllocationDates.startDate,
        endDate: newAllocation.endDate || defaultAllocationDates.endDate,
        percentage: newAllocation.percentage,
      } as Record<string, unknown>,
    }, {
      onSuccess: () => {
        setIsAddAllocationModalOpen(false);
        setNewAllocation({
          employeeId: '',
          initiativeId: '',
          allocationType: 'PROJECT',
          startDate: '',
          endDate: '',
          percentage: 100,
        });
      },
    });
  }, [id, newAllocation, defaultAllocationDates, createAllocation]);

  const openAddAllocationModal = useCallback(() => {
    setNewAllocation({
      employeeId: '',
      initiativeId: selectedInitiativeId || '',
      allocationType: 'PROJECT',
      startDate: defaultAllocationDates.startDate,
      endDate: defaultAllocationDates.endDate,
      percentage: 100,
    });
    setIsAddAllocationModalOpen(true);
  }, [defaultAllocationDates, selectedInitiativeId]);

  const handleAutoAllocate = useCallback(() => {
    if (!id) return;
    autoAllocatePreview.mutate(
      { scenarioId: id },
      {
        onSuccess: (result) => {
          setAutoAllocateResult(result);
          setIsAutoAllocateModalOpen(true);
        },
      }
    );
  }, [id, autoAllocatePreview]);

  const handleApplyAutoAllocate = useCallback(() => {
    if (!id || !autoAllocateResult) return;
    autoAllocateApply.mutate(
      {
        scenarioId: id,
        proposedAllocations: autoAllocateResult.proposedAllocations,
      },
      {
        onSuccess: () => {
          setIsAutoAllocateModalOpen(false);
          setAutoAllocateResult(null);
        },
      }
    );
  }, [id, autoAllocateResult, autoAllocateApply]);

  // Handle initiative selection — auto-expand bottom panel
  const handleSelectInitiative = useCallback((initiativeId: string) => {
    if (selectedInitiativeId === initiativeId) {
      setSelectedInitiativeId(null);
    } else {
      setSelectedInitiativeId(initiativeId);
      setIsBottomPanelCollapsed(false);
    }
  }, [selectedInitiativeId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCompare(false);
        setShowAssumptions(false);
        setSelectedInitiativeId(null);
        setIsAutoAllocateModalOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        console.log('Save scenario');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeInitiative = activeId
    ? initiatives.find(i => i.id === activeId)
    : null;

  const isLoading = scenarioLoading || initiativesLoading || allocationsLoading || analysisLoading;

  if (isLoading && !scenario) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-600 mx-auto"></div>
          <p className="mt-4 text-surface-600">Loading scenario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scenario-planner">
      {/* Header */}
      <header className="planner-header">
        <div className="header-left">
          <Link to="/scenarios" className="back-link">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Scenarios
          </Link>
          <div className="scenario-title-group">
            <div className="flex items-center gap-2">
              <span className="scenario-name-input">
                {scenario?.periodLabel ? `${scenario.periodLabel} — ` : ''}{scenario?.name || 'Untitled Scenario'}
              </span>
              {scenario?.status && <ScenarioStatusBadge status={scenario.status as ScenarioStatus} />}
              {scenario?.isPrimary && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Primary
                </span>
              )}
            </div>
            {scenario?.planLockDate && (
              <span className="text-xs text-surface-400">
                Locked {new Date(scenario.planLockDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {scenario && !scenario.isPrimary && canTransition && (
              <button
                onClick={() => { if (id) setPrimary.mutate(id); }}
                disabled={setPrimary.isPending}
                className="btn-secondary text-xs"
                title="Set as Primary scenario for this quarter"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                Set Primary
              </button>
            )}
            {scenario && (
              <ScenarioStatusActions
                scenario={scenario as Scenario}
                onTransition={(status) => {
                  if (id) transitionStatus.mutate({ id, status });
                }}
                isPending={transitionStatus.isPending}
                canTransition={canTransition}
              />
            )}
          </div>
        </div>

        <div className="header-center">
          <div className="stat-pills">
            <div className="stat-pill">
              <span className="pill-label">Demand</span>
              <span className="pill-value">{stats.totalDemand.toLocaleString()}h</span>
            </div>
            <div className="stat-pill">
              <span className="pill-label">Available</span>
              <span className="pill-value">{stats.totalAvailableCapacity.toLocaleString()}h</span>
            </div>
            <div className="stat-pill">
              <span className="pill-label">Allocated</span>
              <span className="pill-value">{stats.totalUsedCapacity.toLocaleString()}h</span>
            </div>
            <div className={`stat-pill ${stats.utilizationPercent > 90 ? 'warning' : ''}`}>
              <span className="pill-label">Util.</span>
              <span className="pill-value">{stats.utilizationPercent}%</span>
            </div>
            <div className={`stat-pill ${stats.skillGaps > 0 ? 'danger' : ''}`}>
              <span className="pill-label">Gaps</span>
              <span className="pill-value">{stats.skillGaps}</span>
            </div>
            {assumptions.rampEnabled && (
              <div className={`stat-pill ${stats.rampCostHours > stats.totalUsedCapacity * 0.15 ? 'danger' : stats.rampCostHours > 0 ? 'warning' : ''}`}>
                <span className="pill-label">Ramp Cost</span>
                <span className="pill-value">{stats.rampCostHours.toLocaleString()}h</span>
              </div>
            )}
          </div>
        </div>

        <div className="header-right">
          {/* Planning Mode toggle — visible when token_planning_v1 flag is enabled */}
          {tokenFlowEnabled && canEdit && (
            <div className="flex items-center gap-1 rounded-lg border border-surface-200 bg-surface-50 p-0.5">
              <button
                onClick={() => {
                  if (currentPlanningMode !== 'LEGACY') {
                    setPendingPlanningMode('LEGACY');
                    setShowPlanningModeConfirm(true);
                  }
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  currentPlanningMode === 'LEGACY'
                    ? 'bg-white text-surface-900 shadow-sm'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                Legacy
              </button>
              <button
                onClick={() => {
                  if (currentPlanningMode !== 'TOKEN') {
                    setPendingPlanningMode('TOKEN');
                    setShowPlanningModeConfirm(true);
                  }
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  currentPlanningMode === 'TOKEN'
                    ? 'bg-accent-500 text-white shadow-sm'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                Token Flow
              </button>
            </div>
          )}
          {/* Token Ledger link — visible in TOKEN mode */}
          {tokenFlowEnabled && currentPlanningMode === 'TOKEN' && id && (
            <button
              onClick={() => navigate(`/scenarios/${id}/token-ledger`)}
              className="btn-secondary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
              Token Ledger
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              className="btn-secondary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Assumptions
            </button>
            {showAssumptions && (
              <div className="assumptions-dropdown">
                <div className="assumption-row">
                  <label>Allocation Cap</label>
                  <div className="assumption-input">
                    <input
                      type="number"
                      value={assumptions.allocationCap}
                      onChange={(e) => setAssumptions(a => ({ ...a, allocationCap: Number(e.target.value) }))}
                      min={50}
                      max={150}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="assumption-row">
                  <label>Buffer</label>
                  <div className="assumption-input">
                    <input
                      type="number"
                      value={assumptions.bufferPercentage}
                      onChange={(e) => setAssumptions(a => ({ ...a, bufferPercentage: Number(e.target.value) }))}
                      min={0}
                      max={30}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="assumption-row">
                  <label>KTLO</label>
                  <div className="assumption-input">
                    <input
                      type="number"
                      value={assumptions.ktloPercentage}
                      onChange={(e) => setAssumptions(a => ({ ...a, ktloPercentage: Number(e.target.value) }))}
                      min={0}
                      max={50}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="assumption-row">
                  <label>Meetings</label>
                  <div className="assumption-input">
                    <input
                      type="number"
                      value={assumptions.meetingOverheadPercentage}
                      onChange={(e) => setAssumptions(a => ({ ...a, meetingOverheadPercentage: Number(e.target.value) }))}
                      min={0}
                      max={50}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="assumption-row">
                  <label>Ramp Modeling</label>
                  <div className="assumption-input">
                    <button
                      onClick={async () => {
                        const newVal = !assumptions.rampEnabled;
                        setAssumptions(a => ({ ...a, rampEnabled: newVal }));
                        if (id) {
                          // Save to backend
                          const currentAssumptions = scenario?.assumptions as Record<string, unknown> || {};
                          updateScenario.mutate({
                            id,
                            data: { assumptions: { ...currentAssumptions, rampEnabled: newVal } } as Partial<Scenario>,
                          });
                          if (newVal) {
                            // Recompute ramp and invalidate calculator
                            await api.post(`/scenarios/${id}/recompute-ramp`, {});
                            queryClient.invalidateQueries({ queryKey: scenarioKeys.allocations(id) });
                            queryClient.invalidateQueries({ queryKey: scenarioKeys.calculator(id) });
                          }
                        }
                      }}
                      className={`toggle-btn ${assumptions.rampEnabled ? 'active' : ''}`}
                      style={{
                        padding: '2px 12px',
                        borderRadius: '12px',
                        border: '1px solid',
                        borderColor: assumptions.rampEnabled ? 'var(--accent-500, #3b82f6)' : 'var(--surface-300, #d1d5db)',
                        backgroundColor: assumptions.rampEnabled ? 'var(--accent-500, #3b82f6)' : 'transparent',
                        color: assumptions.rampEnabled ? '#fff' : 'inherit',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}
                    >
                      {assumptions.rampEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setShowCompare(true)} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Compare
          </button>
          <button className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
            </svg>
            Save Version
          </button>
          <button className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Export
          </button>
          <button
            onClick={() => { setShowGuidedMode(true); setGuidedStep(0); }}
            className="btn-ghost help-btn"
            title="Start guided tour"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Read-only banner for LOCKED/APPROVED scenarios */}
      {isReadOnly && scenario?.status && (
        <div className={`px-4 py-2 text-center text-sm font-medium ${
          scenario.status === 'LOCKED'
            ? 'bg-amber-50 text-amber-800 border-b border-amber-200'
            : scenario.status === 'APPROVED'
            ? 'bg-green-50 text-green-800 border-b border-green-200'
            : 'bg-surface-50 text-surface-600 border-b border-surface-200'
        }`}>
          {scenario.status === 'LOCKED' && 'This scenario is locked. All editing is disabled.'}
          {scenario.status === 'APPROVED' && 'This scenario is approved. Return to Review to make changes.'}
          {!canEdit && scenario.status !== 'LOCKED' && scenario.status !== 'APPROVED' && 'You do not have permission to edit this scenario.'}
        </div>
      )}

      {/* Main content */}
      <div className="planner-body">
        <div className="planner-main">
          {/* Left Panel - Initiative Rankings */}
          <div
            className="left-panel"
            style={{ width: leftPanelWidth }}
            data-panel="left-panel"
          >
            <div className="panel-header">
              <h3>Initiative Rankings</h3>
              <span className="panel-count">{filteredInitiatives.length}</span>
            </div>

            <div className="panel-toolbar">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search initiatives..."
                className="flex-1"
              />
              <label className="toggle-filter">
                <Checkbox
                  checked={approvedOnly}
                  onChange={(e) => setApprovedOnly(e.target.checked)}
                />
                <span>Approved only</span>
              </label>
            </div>

            <div className="initiatives-list">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredInitiatives.map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredInitiatives.map((initiative, index) => (
                    <SortableInitiativeCard
                      key={initiative.id}
                      initiative={initiative}
                      rank={index + 1}
                      isSelected={selectedInitiativeId === initiative.id}
                      onSelect={handleSelectInitiative}
                    />
                  ))}
                </SortableContext>

                <DragOverlay>
                  {activeInitiative && (
                    <div className="initiative-card dragging">
                      <div className="rank-badge">
                        {initiatives.findIndex(i => i.id === activeInitiative.id) + 1}
                      </div>
                      <div className="flex-1 min-w-0 ml-3">
                        <h4 className="font-medium text-surface-900 truncate">{activeInitiative.title}</h4>
                      </div>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          </div>

          <PanelDivider
            orientation="horizontal"
            onResize={(delta) => setLeftPanelWidth(w => Math.max(320, Math.min(600, w + delta)))}
          />

          {/* Right Panel - Capacity Visualization */}
          <div className="right-panel" data-panel="right-panel">
            <div className="panel-header with-tabs">
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${activeTab === 'quarter' ? 'active' : ''}`}
                  onClick={() => setActiveTab('quarter')}
                >
                  By Quarter
                </button>
                <button
                  className={`panel-tab ${activeTab === 'skill' ? 'active' : ''}`}
                  onClick={() => setActiveTab('skill')}
                >
                  By Skill
                </button>
                <button
                  className={`panel-tab ${activeTab === 'team' ? 'active' : ''}`}
                  onClick={() => setActiveTab('team')}
                >
                  By Team
                </button>
              </div>
            </div>

            <div className="panel-content">
              {activeTab === 'quarter' && <CapacityBarChart data={capacityByWeek} />}
              {activeTab === 'skill' && <SkillCapacityChart data={capacityBySkill} />}
              {activeTab === 'team' && <TeamCapacityChart data={capacityByTeam} />}
            </div>
          </div>
        </div>

        {/* Bottom Panel - Allocation Editor */}
        <div
          className={`bottom-panel ${isBottomPanelCollapsed ? 'collapsed' : ''}`}
          style={{ height: isBottomPanelCollapsed ? 48 : bottomPanelHeight }}
          data-panel="bottom-panel"
        >
          <div className="panel-header collapsible">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsBottomPanelCollapsed(!isBottomPanelCollapsed)}
                className="collapse-toggle"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isBottomPanelCollapsed ? '' : 'rotate-180'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <h3>Allocation Editor</h3>
              <span className="panel-count">{allocations.length} allocations</span>
            </div>
            {!isBottomPanelCollapsed && canModifyAllocations && (
              <div className="flex items-center gap-2">
                <button onClick={openAddAllocationModal} className="btn-secondary">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Allocation
                </button>
                <button
                  onClick={handleAutoAllocate}
                  disabled={autoAllocatePreview.isPending}
                  className="btn-primary auto-allocate"
                >
                  {autoAllocatePreview.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  )}
                  {autoAllocatePreview.isPending ? 'Computing...' : 'Auto-allocate'}
                </button>
              </div>
            )}
          </div>

          {!isBottomPanelCollapsed && (
            <>
              <PanelDivider
                orientation="vertical"
                onResize={(delta) => setBottomPanelHeight(h => Math.max(200, Math.min(500, h - delta)))}
              />
              {selectedInitiativeId && id ? (
                <InitiativeAllocationPanel
                  scenarioId={id}
                  initiativeId={selectedInitiativeId}
                  initiativeTitle={initiatives.find(i => i.id === selectedInitiativeId)?.title || 'Unknown Initiative'}
                  employees={employeeOptions}
                  onClose={() => setSelectedInitiativeId(null)}
                  defaultDates={defaultAllocationDates}
                  readOnly={isReadOnly}
                />
              ) : (
                <div className="allocations-table-wrapper">
                  <table className="allocations-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Initiative</th>
                        <th>Type</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>% Allocation</th>
                        {assumptions.rampEnabled && <th>Ramp</th>}
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((allocation) => {
                        const allocLocked = isReadOnly || (allocation.initiativeStatus !== undefined
                          && allocation.initiativeStatus !== null
                          && LOCKED_STATUSES.includes(allocation.initiativeStatus));
                        return (
                          <tr
                            key={allocation.id}
                            className={allocation.isOverallocated ? 'overallocated' : ''}
                          >
                            <td>
                              <div className="employee-cell">
                                <div className="employee-avatar">
                                  {allocation.employeeName.split(' ').map(n => n[0]).join('')}
                                </div>
                                <span>{allocation.employeeName}</span>
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-accent-100 text-accent-800">
                                  {allocation.initiativeTitle}
                                </span>
                                {allocLocked && (
                                  <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                                allocation.allocationType === 'RUN' ? 'bg-emerald-100 text-emerald-700'
                                  : allocation.allocationType === 'SUPPORT' ? 'bg-purple-100 text-purple-700'
                                  : 'bg-surface-100 text-surface-600'
                              }`}>
                                {allocation.allocationType}
                              </span>
                            </td>
                            <td>
                              {allocLocked ? (
                                <span className="text-surface-500">{allocation.startDate}</span>
                              ) : (
                                <InlineEdit
                                  value={allocation.startDate}
                                  onChange={(v) => handleAllocationChange(allocation.id, 'startDate', v)}
                                  type="date"
                                />
                              )}
                            </td>
                            <td>
                              {allocLocked ? (
                                <span className="text-surface-500">{allocation.endDate}</span>
                              ) : (
                                <InlineEdit
                                  value={allocation.endDate}
                                  onChange={(v) => handleAllocationChange(allocation.id, 'endDate', v)}
                                  type="date"
                                />
                              )}
                            </td>
                            <td>
                              <div className="percentage-cell">
                                {allocLocked ? (
                                  <span className="text-surface-500">{allocation.percentage}</span>
                                ) : (
                                  <InlineEdit
                                    value={allocation.percentage}
                                    onChange={(v) => handleAllocationChange(allocation.id, 'percentage', v)}
                                    type="number"
                                    className="percentage-input"
                                  />
                                )}
                                <span>%</span>
                                <div className="percentage-bar-mini">
                                  <div
                                    className={`bar ${allocation.percentage > 100 ? 'over' : ''}`}
                                    style={{ width: `${Math.min(allocation.percentage, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            {assumptions.rampEnabled && (
                              <td>
                                <span className={`text-xs font-mono font-medium ${
                                  (allocation.rampModifier ?? 1) < 0.75 ? 'text-red-600' :
                                  (allocation.rampModifier ?? 1) < 0.90 ? 'text-amber-600' :
                                  'text-green-600'
                                }`}>
                                  {allocation.rampModifier !== undefined
                                    ? `${Math.round(allocation.rampModifier * 100)}%`
                                    : '100%'}
                                </span>
                              </td>
                            )}
                            <td>
                              {allocation.isOverallocated && (
                                <span className="overallocation-warning" title="Employee is overallocated">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              )}
                            </td>
                            <td>
                              {allocLocked ? (
                                <span className="text-xs text-surface-400">Locked</span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteAllocation(allocation.id)}
                                  className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete allocation"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compare Modal */}
      <CompareModal isOpen={showCompare} onClose={() => setShowCompare(false)} />

      {/* Guided Mode */}
      {showGuidedMode && (
        <GuidedModeOverlay
          step={guidedStep}
          onNext={() => {
            if (guidedStep >= 2) {
              setShowGuidedMode(false);
            } else {
              setGuidedStep(s => s + 1);
            }
          }}
          onSkip={() => setShowGuidedMode(false)}
        />
      )}

      {/* Planning Mode Confirmation Modal */}
      <Modal
        isOpen={showPlanningModeConfirm}
        onClose={() => { setShowPlanningModeConfirm(false); setPendingPlanningMode(null); }}
        title="Switch Planning Mode"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-surface-600">
            {pendingPlanningMode === 'TOKEN'
              ? 'Switching to Token Flow mode will use token-based capacity planning for this scenario. You can switch back at any time.'
              : 'Switching to Legacy mode will use time-based capacity planning. Any token data will be preserved.'}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowPlanningModeConfirm(false); setPendingPlanningMode(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (id && pendingPlanningMode) {
                  planningModeToggle.mutate(
                    { id, planningMode: pendingPlanningMode },
                    { onSettled: () => { setShowPlanningModeConfirm(false); setPendingPlanningMode(null); } },
                  );
                }
              }}
              disabled={planningModeToggle.isPending}
              className="btn-primary"
            >
              {planningModeToggle.isPending ? 'Switching...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Auto-Allocate Preview Modal */}
      <Modal
        isOpen={isAutoAllocateModalOpen}
        onClose={() => setIsAutoAllocateModalOpen(false)}
        title="Auto-Allocate Preview"
        size="xl"
      >
        {autoAllocateResult && (
          <div className="space-y-5">
            {/* Summary banner */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-accent-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-accent-700">{autoAllocateResult.summary.totalAllocations}</div>
                <div className="text-xs text-accent-600">Allocations</div>
              </div>
              <div className="bg-accent-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-accent-700">{autoAllocateResult.summary.employeesUsed}</div>
                <div className="text-xs text-accent-600">Employees</div>
              </div>
              <div className="bg-accent-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-accent-700">{autoAllocateResult.summary.initiativesCovered}</div>
                <div className="text-xs text-accent-600">Initiatives</div>
              </div>
              <div className="bg-accent-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-accent-700">{autoAllocateResult.summary.totalHoursAllocated.toLocaleString()}</div>
                <div className="text-xs text-accent-600">Hours</div>
              </div>
            </div>

            {/* Warnings */}
            {autoAllocateResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <h4 className="text-sm font-medium text-amber-800 mb-1">Warnings</h4>
                <ul className="text-xs text-amber-700 space-y-1">
                  {autoAllocateResult.warnings.map((warning, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Coverage by initiative */}
            <div>
              <h4 className="text-sm font-medium text-surface-700 mb-2">Coverage by Initiative</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {autoAllocateResult.coverage.map((cov) => (
                  <div key={cov.initiativeId} className="border border-surface-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-accent-600 rounded-full">
                          {cov.rank}
                        </span>
                        <span className="text-sm font-medium text-surface-800 truncate">{cov.initiativeTitle}</span>
                      </div>
                      <span className={`text-xs font-semibold ${
                        cov.overallCoveragePercent >= 100 ? 'text-green-600' :
                        cov.overallCoveragePercent >= 50 ? 'text-amber-600' :
                        'text-red-600'
                      }`}>
                        {cov.overallCoveragePercent}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cov.skills.map((skill) => (
                        <div key={skill.skill} className="flex items-center gap-2">
                          <span className="text-xs text-surface-500 w-20 truncate">{skill.skill}</span>
                          <div className="flex-1 bg-surface-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                skill.coveragePercent >= 100 ? 'bg-green-500' :
                                skill.coveragePercent >= 50 ? 'bg-amber-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(skill.coveragePercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-surface-400 w-16 text-right">
                            {skill.allocatedHours}/{skill.demandHours}h
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Proposed allocations table */}
            {autoAllocateResult.proposedAllocations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-surface-700 mb-2">Proposed Allocations</h4>
                <div className="max-h-48 overflow-y-auto border border-surface-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-surface-500">Employee</th>
                        <th className="text-left px-3 py-1.5 font-medium text-surface-500">Initiative</th>
                        <th className="text-left px-3 py-1.5 font-medium text-surface-500">Skill</th>
                        <th className="text-right px-3 py-1.5 font-medium text-surface-500">%</th>
                        <th className="text-right px-3 py-1.5 font-medium text-surface-500">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {autoAllocateResult.proposedAllocations.map((alloc, i) => (
                        <tr key={i} className="hover:bg-surface-50">
                          <td className="px-3 py-1.5 text-surface-700">{alloc.employeeName}</td>
                          <td className="px-3 py-1.5 text-surface-700">{alloc.initiativeTitle}</td>
                          <td className="px-3 py-1.5 text-surface-500">{alloc.skill}</td>
                          <td className="px-3 py-1.5 text-right text-surface-700">{alloc.percentage}%</td>
                          <td className="px-3 py-1.5 text-right text-surface-700">{alloc.hours.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-surface-200">
              <button
                onClick={() => setIsAutoAllocateModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-md hover:bg-surface-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyAutoAllocate}
                disabled={autoAllocateResult.proposedAllocations.length === 0 || autoAllocateApply.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-md hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {autoAllocateApply.isPending
                  ? 'Applying...'
                  : `Apply ${autoAllocateResult.proposedAllocations.length} Allocations`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Allocation Modal */}
      <Modal
        isOpen={isAddAllocationModalOpen}
        onClose={() => setIsAddAllocationModalOpen(false)}
        title={
          newAllocation.initiativeId
            ? `Add Allocation — ${initiativeOptions.find(o => o.value === newAllocation.initiativeId)?.label || ''}`
            : 'Add Allocation'
        }
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
              Employee <span className="text-red-500">*</span>
            </label>
            <Select
              options={employeeOptions}
              value={newAllocation.employeeId}
              onChange={(value) => setNewAllocation(prev => ({ ...prev, employeeId: value }))}
              placeholder="Select an employee..."
              allowClear={false}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
              Initiative
            </label>
            <Select
              options={initiativeOptions}
              value={newAllocation.initiativeId}
              onChange={(value) => setNewAllocation(prev => ({ ...prev, initiativeId: value }))}
              placeholder="Select an initiative (optional)..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
              Allocation Type
            </label>
            <select
              value={newAllocation.allocationType}
              onChange={(e) => setNewAllocation(prev => ({ ...prev, allocationType: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 bg-white"
            >
              <option value="PROJECT">Project</option>
              <option value="RUN">Run</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
                Start Date
              </label>
              <input
                type="date"
                value={newAllocation.startDate}
                min={defaultAllocationDates.startDate}
                max={defaultAllocationDates.endDate}
                onChange={(e) => setNewAllocation(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
                End Date
              </label>
              <input
                type="date"
                value={newAllocation.endDate}
                min={defaultAllocationDates.startDate}
                max={defaultAllocationDates.endDate}
                onChange={(e) => setNewAllocation(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
              Allocation Percentage: {newAllocation.percentage}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={newAllocation.percentage}
              onChange={(e) => setNewAllocation(prev => ({ ...prev, percentage: Number(e.target.value) }))}
              className="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-accent-600"
            />
            <div className="flex justify-between text-xs text-surface-400 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              onClick={() => setIsAddAllocationModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-md hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateAllocation}
              disabled={!newAllocation.employeeId || createAllocation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-md hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createAllocation.isPending ? 'Creating...' : 'Create Allocation'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
