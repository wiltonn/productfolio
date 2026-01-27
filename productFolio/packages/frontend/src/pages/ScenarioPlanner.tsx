import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import { SearchInput, StatusBadge, Checkbox } from '../components/ui';
import type { InitiativeStatus } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface InitiativeForPlanning {
  id: string;
  title: string;
  quarter: string;
  status: InitiativeStatus;
  totalHours: number;
  demandBySkill: Record<string, number>;
  hasShortage: boolean;
}

interface CapacityByQuarter {
  quarter: string;
  capacity: number;
  demand: number;
  gap: number;
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
  startDate: string;
  endDate: string;
  percentage: number;
  isOverallocated: boolean;
}

interface ScenarioAssumptions {
  allocationCap: number;
  bufferPercentage: number;
  ktloPercentage: number;
}

// ============================================================================
// MOCK DATA
// ============================================================================

const mockInitiatives: InitiativeForPlanning[] = [
  { id: '1', title: 'Customer Portal Redesign', quarter: '2026-Q1', status: 'APPROVED', totalHours: 520, demandBySkill: { Frontend: 280, Backend: 160, Design: 80 }, hasShortage: false },
  { id: '2', title: 'API Gateway Migration', quarter: '2026-Q1', status: 'APPROVED', totalHours: 440, demandBySkill: { Backend: 320, DevOps: 120 }, hasShortage: true },
  { id: '3', title: 'Mobile App v2', quarter: '2026-Q2', status: 'IN_PROGRESS', totalHours: 680, demandBySkill: { Frontend: 360, Backend: 200, Design: 120 }, hasShortage: false },
  { id: '4', title: 'Data Pipeline Optimization', quarter: '2026-Q1', status: 'APPROVED', totalHours: 320, demandBySkill: { Backend: 200, Data: 120 }, hasShortage: true },
  { id: '5', title: 'Analytics Dashboard', quarter: '2026-Q2', status: 'PENDING_APPROVAL', totalHours: 400, demandBySkill: { Frontend: 200, Data: 120, Design: 80 }, hasShortage: false },
  { id: '6', title: 'Security Audit Implementation', quarter: '2026-Q1', status: 'APPROVED', totalHours: 240, demandBySkill: { Backend: 120, DevOps: 80, Security: 40 }, hasShortage: true },
  { id: '7', title: 'Search Infrastructure', quarter: '2026-Q2', status: 'DRAFT', totalHours: 560, demandBySkill: { Backend: 320, Data: 160, DevOps: 80 }, hasShortage: false },
  { id: '8', title: 'Notification System', quarter: '2026-Q1', status: 'APPROVED', totalHours: 280, demandBySkill: { Backend: 160, Frontend: 120 }, hasShortage: false },
];

const mockCapacityByQuarter: CapacityByQuarter[] = [
  { quarter: '2026-Q1', capacity: 1800, demand: 1520, gap: 280 },
  { quarter: '2026-Q2', capacity: 1920, demand: 1640, gap: 280 },
  { quarter: '2026-Q3', capacity: 1760, demand: 1200, gap: 560 },
  { quarter: '2026-Q4', capacity: 1840, demand: 800, gap: 1040 },
];

const mockCapacityBySkill: CapacityBySkill[] = [
  { skill: 'Frontend', capacity: 960, demand: 960, gap: 0 },
  { skill: 'Backend', capacity: 1280, demand: 1480, gap: -200 },
  { skill: 'Design', capacity: 400, demand: 280, gap: 120 },
  { skill: 'Data', capacity: 320, demand: 400, gap: -80 },
  { skill: 'DevOps', capacity: 240, demand: 280, gap: -40 },
  { skill: 'Security', capacity: 80, demand: 40, gap: 40 },
];

const mockCapacityByTeam: CapacityByTeam[] = [
  { team: 'Platform', capacity: 1200, demand: 1080, gap: 120 },
  { team: 'Product', capacity: 960, demand: 1120, gap: -160 },
  { team: 'Data', capacity: 480, demand: 520, gap: -40 },
  { team: 'Infrastructure', capacity: 320, demand: 280, gap: 40 },
];

const mockAllocations: AllocationRow[] = [
  { id: '1', employeeId: 'e1', employeeName: 'Sarah Chen', initiativeId: '1', initiativeTitle: 'Customer Portal Redesign', startDate: '2026-01-06', endDate: '2026-03-27', percentage: 80, isOverallocated: false },
  { id: '2', employeeId: 'e1', employeeName: 'Sarah Chen', initiativeId: '3', initiativeTitle: 'Mobile App v2', startDate: '2026-01-06', endDate: '2026-02-14', percentage: 40, isOverallocated: true },
  { id: '3', employeeId: 'e2', employeeName: 'Mike Johnson', initiativeId: '2', initiativeTitle: 'API Gateway Migration', startDate: '2026-01-06', endDate: '2026-03-27', percentage: 100, isOverallocated: false },
  { id: '4', employeeId: 'e3', employeeName: 'Alex Rivera', initiativeId: '1', initiativeTitle: 'Customer Portal Redesign', startDate: '2026-02-03', endDate: '2026-03-27', percentage: 60, isOverallocated: false },
  { id: '5', employeeId: 'e4', employeeName: 'Emily Watson', initiativeId: '4', initiativeTitle: 'Data Pipeline Optimization', startDate: '2026-01-06', endDate: '2026-02-28', percentage: 100, isOverallocated: false },
  { id: '6', employeeId: 'e5', employeeName: 'Priya Patel', initiativeId: '2', initiativeTitle: 'API Gateway Migration', startDate: '2026-01-20', endDate: '2026-03-13', percentage: 50, isOverallocated: false },
  { id: '7', employeeId: 'e5', employeeName: 'Priya Patel', initiativeId: '6', initiativeTitle: 'Security Audit Implementation', startDate: '2026-02-03', endDate: '2026-03-27', percentage: 60, isOverallocated: true },
];


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
}: {
  initiative: InitiativeForPlanning;
  rank: number;
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
        initiative-card group relative
        ${isDragging ? 'z-50 shadow-xl ring-2 ring-accent-400' : ''}
        ${initiative.hasShortage ? 'shortage' : ''}
      `}
      {...attributes}
      {...listeners}
    >
      {/* Rank indicator */}
      <div className="rank-badge">
        {rank}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 ml-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-surface-900 truncate">{initiative.title}</h4>
          {initiative.hasShortage && (
            <span className="shortage-indicator" title="Resource shortage">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="quarter-badge">{initiative.quarter}</span>
          <span className="hours-badge">{initiative.totalHours.toLocaleString()}h</span>
          <StatusBadge status={initiative.status} />
        </div>
      </div>

      {/* Drag handle */}
      <div className="drag-handle">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
        </svg>
      </div>
    </div>
  );
}

// Capacity Bar Chart (for By Quarter view)
function CapacityBarChart({ data }: { data: CapacityByQuarter[] }) {
  const maxValue = Math.max(...data.flatMap(d => [d.capacity, d.demand]));

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
      <div className="chart-bars">
        {data.map((item, i) => {
          const capacityHeight = (item.capacity / maxValue) * 100;
          const demandHeight = (item.demand / maxValue) * 100;
          const status = item.gap < 0 ? 'shortage' : item.gap < item.capacity * 0.1 ? 'tight' : 'ok';

          return (
            <div
              key={item.quarter}
              className="bar-group"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="bar-container">
                <div className="bar capacity" style={{ height: `${capacityHeight}%` }}>
                  <div className="bar-glow" />
                </div>
                <div className={`bar demand ${status}`} style={{ height: `${demandHeight}%` }}>
                  <div className="bar-glow" />
                </div>
              </div>
              <div className="bar-label">{item.quarter}</div>
              <div className={`bar-value ${status}`}>
                {item.gap >= 0 ? '+' : ''}{item.gap}h
              </div>
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
// MAIN COMPONENT
// ============================================================================

export function ScenarioPlanner() {
  const { id } = useParams<{ id: string }>();

  // Panel sizing state
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(280);
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);

  // Initiative state
  const [initiatives, setInitiatives] = useState(mockInitiatives);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Visualization state
  const [activeTab, setActiveTab] = useState<'quarter' | 'skill' | 'team'>('quarter');

  // Allocation state
  const [allocations, setAllocations] = useState(mockAllocations);

  // Scenario state
  const [scenarioName, setScenarioName] = useState('Q1 2026 Resource Plan');
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>({
    allocationCap: 100,
    bufferPercentage: 10,
    ktloPercentage: 15,
  });
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Guided mode
  const [showGuidedMode, setShowGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);

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
      if (approvedOnly && init.status !== 'APPROVED' && init.status !== 'IN_PROGRESS') {
        return false;
      }
      if (searchQuery) {
        return init.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [initiatives, approvedOnly, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const totalDemand = initiatives.reduce((sum, i) => sum + i.totalHours, 0);
    const totalCapacity = mockCapacityByQuarter.reduce((sum, q) => sum + q.capacity, 0);
    const skillGaps = mockCapacityBySkill.filter(s => s.gap < 0).length;
    const utilizationPercent = Math.round((totalDemand / totalCapacity) * 100);
    return { totalDemand, totalCapacity, skillGaps, utilizationPercent };
  }, [initiatives]);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setInitiatives(items => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  // Allocation handlers
  const handleAllocationChange = useCallback((
    allocationId: string,
    field: keyof AllocationRow,
    value: string
  ) => {
    setAllocations(allocs => allocs.map(a => {
      if (a.id === allocationId) {
        return { ...a, [field]: field === 'percentage' ? Number(value) : value };
      }
      return a;
    }));
  }, []);

  const handleAutoAllocate = useCallback(() => {
    // Placeholder for auto-allocation logic
    console.log('Auto-allocate triggered');
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCompare(false);
        setShowAssumptions(false);
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
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="scenario-name-input"
            />
            <span className="scenario-id">ID: {id}</span>
          </div>
        </div>

        <div className="header-center">
          <div className="stat-pills">
            <div className="stat-pill">
              <span className="pill-label">Demand</span>
              <span className="pill-value">{stats.totalDemand.toLocaleString()}h</span>
            </div>
            <div className="stat-pill">
              <span className="pill-label">Capacity</span>
              <span className="pill-value">{stats.totalCapacity.toLocaleString()}h</span>
            </div>
            <div className={`stat-pill ${stats.utilizationPercent > 90 ? 'warning' : ''}`}>
              <span className="pill-label">Util.</span>
              <span className="pill-value">{stats.utilizationPercent}%</span>
            </div>
            <div className={`stat-pill ${stats.skillGaps > 0 ? 'danger' : ''}`}>
              <span className="pill-label">Gaps</span>
              <span className="pill-value">{stats.skillGaps}</span>
            </div>
          </div>
        </div>

        <div className="header-right">
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
              {activeTab === 'quarter' && <CapacityBarChart data={mockCapacityByQuarter} />}
              {activeTab === 'skill' && <SkillCapacityChart data={mockCapacityBySkill} />}
              {activeTab === 'team' && <TeamCapacityChart data={mockCapacityByTeam} />}
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
            {!isBottomPanelCollapsed && (
              <button onClick={handleAutoAllocate} className="btn-primary auto-allocate">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                Auto-allocate
              </button>
            )}
          </div>

          {!isBottomPanelCollapsed && (
            <>
              <PanelDivider
                orientation="vertical"
                onResize={(delta) => setBottomPanelHeight(h => Math.max(200, Math.min(500, h - delta)))}
              />
              <div className="allocations-table-wrapper">
                <table className="allocations-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Initiative</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>% Allocation</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((allocation) => (
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
                          <span className="initiative-name">{allocation.initiativeTitle}</span>
                        </td>
                        <td>
                          <InlineEdit
                            value={allocation.startDate}
                            onChange={(v) => handleAllocationChange(allocation.id, 'startDate', v)}
                            type="date"
                          />
                        </td>
                        <td>
                          <InlineEdit
                            value={allocation.endDate}
                            onChange={(v) => handleAllocationChange(allocation.id, 'endDate', v)}
                            type="date"
                          />
                        </td>
                        <td>
                          <div className="percentage-cell">
                            <InlineEdit
                              value={allocation.percentage}
                              onChange={(v) => handleAllocationChange(allocation.id, 'percentage', v)}
                              type="number"
                              className="percentage-input"
                            />
                            <span>%</span>
                            <div className="percentage-bar-mini">
                              <div
                                className={`bar ${allocation.percentage > 100 ? 'over' : ''}`}
                                style={{ width: `${Math.min(allocation.percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          {allocation.isOverallocated && (
                            <span className="overallocation-warning" title="Employee is overallocated">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
    </div>
  );
}
