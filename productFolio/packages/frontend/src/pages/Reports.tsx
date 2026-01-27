import { useState } from 'react';
import { Select } from '../components/ui';
import { getQuarterOptions, getCurrentQuarter } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface QuarterSummary {
  totalInitiatives: number;
  totalHours: number;
  capacityUtilization: number;
  trend: number; // percentage change from previous quarter
}

interface SkillGap {
  skill: string;
  demand: number;
  capacity: number;
  gap: number;
  severity: 'critical' | 'warning' | 'moderate';
}

interface OverallocatedPerson {
  id: string;
  name: string;
  allocation: number;
  initiatives: string[];
  avatar: string;
}

interface DeliveryItem {
  id: string;
  title: string;
  quarter: string;
  status: 'on-track' | 'at-risk' | 'delayed';
  progress: number;
  endDate: string;
}

interface ScenarioMetrics {
  id: string;
  name: string;
  utilization: number;
  skillGaps: number;
  totalHours: number;
  risk: 'low' | 'medium' | 'high';
}

// ============================================================================
// MOCK DATA
// ============================================================================

const mockQuarterSummary: QuarterSummary = {
  totalInitiatives: 8,
  totalHours: 3440,
  capacityUtilization: 87,
  trend: 5.2,
};

const mockSkillGaps: SkillGap[] = [
  { skill: 'Backend', demand: 1480, capacity: 1280, gap: -200, severity: 'critical' },
  { skill: 'Data Engineering', demand: 400, capacity: 320, gap: -80, severity: 'warning' },
  { skill: 'DevOps', demand: 280, capacity: 240, gap: -40, severity: 'moderate' },
  { skill: 'Security', demand: 120, capacity: 80, gap: -40, severity: 'moderate' },
];

const mockOverallocated: OverallocatedPerson[] = [
  { id: '1', name: 'Sarah Chen', allocation: 120, initiatives: ['Portal Redesign', 'Mobile App v2'], avatar: 'SC' },
  { id: '2', name: 'Priya Patel', allocation: 110, initiatives: ['API Gateway', 'Security Audit'], avatar: 'PP' },
  { id: '3', name: 'Alex Rivera', allocation: 105, initiatives: ['Analytics Dashboard', 'Data Pipeline'], avatar: 'AR' },
];

const mockDeliveryItems: DeliveryItem[] = [
  { id: '1', title: 'Customer Portal Redesign', quarter: '2026-Q1', status: 'on-track', progress: 68, endDate: '2026-03-27' },
  { id: '2', title: 'API Gateway Migration', quarter: '2026-Q1', status: 'at-risk', progress: 45, endDate: '2026-03-20' },
  { id: '3', title: 'Mobile App v2', quarter: '2026-Q2', status: 'on-track', progress: 22, endDate: '2026-06-15' },
  { id: '4', title: 'Data Pipeline Optimization', quarter: '2026-Q1', status: 'delayed', progress: 35, endDate: '2026-02-28' },
  { id: '5', title: 'Analytics Dashboard', quarter: '2026-Q2', status: 'on-track', progress: 12, endDate: '2026-05-30' },
  { id: '6', title: 'Security Audit Implementation', quarter: '2026-Q1', status: 'on-track', progress: 55, endDate: '2026-03-15' },
];

const mockScenarios: ScenarioMetrics[] = [
  { id: '1', name: 'Q1 Baseline', utilization: 78, skillGaps: 2, totalHours: 3200, risk: 'low' },
  { id: '2', name: 'Aggressive Growth', utilization: 92, skillGaps: 4, totalHours: 4100, risk: 'high' },
];

// Sparkline data (last 6 data points for mini trends)
const utilizationTrend = [72, 75, 78, 82, 85, 87];
const hoursTrend = [2800, 2950, 3100, 3200, 3350, 3440];
const initiativesTrend = [5, 6, 6, 7, 8, 8];

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================

function Sparkline({
  data,
  color = 'currentColor',
  height = 24,
  width = 80,
  showArea = false,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  showArea?: boolean;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const areaPath = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return i === 0 ? `M ${x},${height} L ${x},${y}` : `L ${x},${y}`;
  }).join(' ') + ` L ${width},${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showArea && (
        <path
          d={areaPath}
          fill={color}
          fillOpacity={0.1}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

function ProgressBar({
  value,
  max = 100,
  size = 'md',
  status = 'default',
  showValue = false,
}: {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  status?: 'default' | 'success' | 'warning' | 'danger';
  showValue?: boolean;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2' };
  const colors = {
    default: 'bg-accent-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-surface-200 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`${heights[size]} ${colors[status]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs font-mono text-surface-500 tabular-nums w-8 text-right">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({
  label,
  value,
  unit,
  trend,
  trendData,
  delay = 0,
}: {
  label: string;
  value: string | number;
  unit?: string;
  trend?: number;
  trendData?: number[];
  delay?: number;
}) {
  const isPositive = trend && trend > 0;
  const trendColor = isPositive ? 'text-emerald-600' : 'text-red-500';
  const sparklineColor = isPositive ? '#059669' : '#dc2626';

  return (
    <div
      className="report-stat-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="stat-label">{label}</span>
        {trendData && (
          <Sparkline data={trendData} color={sparklineColor} height={20} width={60} showArea />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-display font-bold text-surface-900 tabular-nums tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="text-sm font-medium text-surface-500">{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendColor}`}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {isPositive ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
            )}
          </svg>
          <span>{Math.abs(trend).toFixed(1)}% vs last quarter</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SKILL GAPS TABLE
// ============================================================================

function SkillGapsCard({ data }: { data: SkillGap[] }) {
  const severityConfig = {
    critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
    moderate: { bg: 'bg-surface-50', border: 'border-surface-200', text: 'text-surface-600', badge: 'bg-surface-100 text-surface-700' },
  };

  return (
    <div className="report-card">
      <div className="report-card-header">
        <div className="flex items-center gap-2">
          <div className="report-card-icon danger">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="report-card-title">Skill Gaps</h3>
        </div>
        <span className="report-card-count danger">{data.length} shortages</span>
      </div>

      <div className="divide-y divide-surface-100">
        {data.map((gap, i) => {
          const config = severityConfig[gap.severity];
          const utilization = Math.round((gap.demand / gap.capacity) * 100);

          return (
            <div
              key={gap.skill}
              className="skill-gap-row"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-surface-900">{gap.skill}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
                    {gap.severity}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-surface-500">
                    <span className="font-mono font-semibold text-surface-700">{gap.demand.toLocaleString()}</span>
                    <span className="mx-1">/</span>
                    <span className="font-mono">{gap.capacity.toLocaleString()}h</span>
                  </span>
                  <span className={`font-mono font-bold ${config.text}`}>
                    {gap.gap}h
                  </span>
                </div>
              </div>
              <div className="relative h-2 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-surface-300 rounded-full"
                  style={{ width: '100%' }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                    gap.severity === 'critical' ? 'bg-red-500' :
                    gap.severity === 'warning' ? 'bg-amber-500' : 'bg-accent-500'
                  }`}
                  style={{ width: `${Math.min(utilization, 150)}%` }}
                />
                {utilization > 100 && (
                  <div
                    className="absolute inset-y-0 bg-red-400/30 rounded-r-full"
                    style={{ left: '100%', width: `${utilization - 100}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// OVERALLOCATED PEOPLE CARD
// ============================================================================

function OverallocatedCard({ data }: { data: OverallocatedPerson[] }) {
  return (
    <div className="report-card">
      <div className="report-card-header">
        <div className="flex items-center gap-2">
          <div className="report-card-icon warning">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="report-card-title">Overallocated People</h3>
        </div>
        <span className="report-card-count warning">{data.length} people</span>
      </div>

      <div className="space-y-3">
        {data.map((person, i) => {
          const overBy = person.allocation - 100;

          return (
            <div
              key={person.id}
              className="overallocated-row"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="overallocated-avatar">
                  {person.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-surface-900">{person.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-amber-600">
                        {person.allocation}%
                      </span>
                      <span className="text-xs text-red-500 font-medium">
                        +{overBy}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {person.initiatives.map((init, idx) => (
                      <span
                        key={init}
                        className="text-xs text-surface-500 truncate"
                      >
                        {init}{idx < person.initiatives.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(person.allocation, 150)}%`,
                      background: `linear-gradient(to right, #f59e0b ${100 / person.allocation * 100}%, #ef4444 ${100 / person.allocation * 100}%)`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// DELIVERY FORECAST TIMELINE
// ============================================================================

function DeliveryForecastCard({ data }: { data: DeliveryItem[] }) {
  const quarters = [...new Set(data.map(d => d.quarter))].sort();

  const statusConfig = {
    'on-track': { color: 'bg-emerald-500', label: 'On Track', badge: 'bg-emerald-100 text-emerald-800' },
    'at-risk': { color: 'bg-amber-500', label: 'At Risk', badge: 'bg-amber-100 text-amber-800' },
    'delayed': { color: 'bg-red-500', label: 'Delayed', badge: 'bg-red-100 text-red-800' },
  };

  return (
    <div className="report-card col-span-full">
      <div className="report-card-header">
        <div className="flex items-center gap-2">
          <div className="report-card-icon accent">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <h3 className="report-card-title">Delivery Forecast</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {Object.entries(statusConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${config.color}`} />
              <span className="text-surface-500">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="delivery-timeline">
        {quarters.map((quarter) => {
          const items = data.filter(d => d.quarter === quarter);

          return (
            <div key={quarter} className="timeline-quarter">
              <div className="timeline-quarter-header">
                <span className="font-mono font-semibold text-surface-900">{quarter}</span>
                <span className="text-xs text-surface-400">{items.length} initiatives</span>
              </div>
              <div className="timeline-items">
                {items.map((item, i) => {
                  const config = statusConfig[item.status];

                  return (
                    <div
                      key={item.id}
                      className="timeline-item"
                      style={{ animationDelay: `${i * 75}ms` }}
                    >
                      <div className="timeline-item-header">
                        <span className={`timeline-status-dot ${config.color}`} />
                        <span className="timeline-item-title">{item.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${config.badge}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <ProgressBar
                          value={item.progress}
                          size="sm"
                          status={item.status === 'on-track' ? 'success' : item.status === 'at-risk' ? 'warning' : 'danger'}
                        />
                        <span className="text-xs font-mono text-surface-500 whitespace-nowrap">
                          {item.progress}%
                        </span>
                        <span className="text-xs text-surface-400 whitespace-nowrap">
                          Due {new Date(item.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// SCENARIO COMPARISON CARD
// ============================================================================

function ScenarioComparisonCard({
  scenarios,
  selectedIds,
  onSelect,
}: {
  scenarios: ScenarioMetrics[];
  selectedIds: [string, string];
  onSelect: (ids: [string, string]) => void;
}) {
  const scenario1 = scenarios.find(s => s.id === selectedIds[0]);
  const scenario2 = scenarios.find(s => s.id === selectedIds[1]);

  if (!scenario1 || !scenario2) return null;

  const metrics = [
    { label: 'Utilization', key: 'utilization', unit: '%', format: (v: number) => `${v}%` },
    { label: 'Total Hours', key: 'totalHours', unit: 'h', format: (v: number) => v.toLocaleString() + 'h' },
    { label: 'Skill Gaps', key: 'skillGaps', unit: '', format: (v: number) => v.toString() },
  ];

  const riskConfig = {
    low: { color: 'text-emerald-600', bg: 'bg-emerald-100' },
    medium: { color: 'text-amber-600', bg: 'bg-amber-100' },
    high: { color: 'text-red-600', bg: 'bg-red-100' },
  };

  return (
    <div className="report-card col-span-full lg:col-span-1">
      <div className="report-card-header">
        <div className="flex items-center gap-2">
          <div className="report-card-icon">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h3 className="report-card-title">Scenario Comparison</h3>
        </div>
      </div>

      <div className="scenario-comparison">
        <div className="comparison-headers">
          <div className="comparison-column">
            <select
              value={selectedIds[0]}
              onChange={(e) => onSelect([e.target.value, selectedIds[1]])}
              className="comparison-select"
            >
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="comparison-divider">
            <span className="text-xs font-medium text-surface-400">VS</span>
          </div>
          <div className="comparison-column">
            <select
              value={selectedIds[1]}
              onChange={(e) => onSelect([selectedIds[0], e.target.value])}
              className="comparison-select"
            >
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="comparison-metrics">
          {metrics.map((metric) => {
            const val1 = scenario1[metric.key as keyof ScenarioMetrics] as number;
            const val2 = scenario2[metric.key as keyof ScenarioMetrics] as number;
            const diff = val1 - val2;
            const diffPercent = val2 !== 0 ? ((val1 - val2) / val2) * 100 : 0;

            return (
              <div key={metric.key} className="comparison-metric-row">
                <div className="comparison-value left">
                  <span className="font-mono font-bold text-surface-900">{metric.format(val1)}</span>
                </div>
                <div className="comparison-label">
                  <span className="text-xs font-medium text-surface-500 uppercase tracking-wide">{metric.label}</span>
                  {diff !== 0 && (
                    <span className={`text-xs font-mono ${diff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {diff > 0 ? '+' : ''}{diffPercent.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="comparison-value right">
                  <span className="font-mono font-bold text-surface-900">{metric.format(val2)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="comparison-risk">
          <div className={`risk-badge ${riskConfig[scenario1.risk].bg} ${riskConfig[scenario1.risk].color}`}>
            {scenario1.risk.charAt(0).toUpperCase() + scenario1.risk.slice(1)} Risk
          </div>
          <div className={`risk-badge ${riskConfig[scenario2.risk].bg} ${riskConfig[scenario2.risk].color}`}>
            {scenario2.risk.charAt(0).toUpperCase() + scenario2.risk.slice(1)} Risk
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Reports() {
  // Filter state
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [selectedScenario, setSelectedScenario] = useState('1');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [comparisonScenarios, setComparisonScenarios] = useState<[string, string]>(['1', '2']);

  const quarterOptions = getQuarterOptions(1, 2);
  const scenarioOptions = [
    { value: '1', label: 'Q1 Baseline' },
    { value: '2', label: 'Aggressive Growth' },
    { value: '3', label: 'Conservative Approach' },
  ];
  const teamOptions = [
    { value: '', label: 'All Teams' },
    { value: 'platform', label: 'Platform' },
    { value: 'product', label: 'Product' },
    { value: 'data', label: 'Data' },
    { value: 'infrastructure', label: 'Infrastructure' },
  ];

  return (
    <div className="reports-dashboard animate-fade-in">
      {/* Header */}
      <div className="reports-header">
        <div>
          <h1 className="page-title">Reports Dashboard</h1>
          <p className="page-subtitle">Portfolio insights and performance metrics</p>
        </div>
        <div className="reports-actions">
          <button className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            Customize
          </button>
          <button className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="reports-filters">
        <div className="filter-group">
          <Select
            options={quarterOptions}
            value={selectedQuarter}
            onChange={setSelectedQuarter}
            label="Quarter"
            className="w-36"
            allowClear={false}
          />
          <Select
            options={scenarioOptions}
            value={selectedScenario}
            onChange={setSelectedScenario}
            label="Scenario"
            className="w-44"
            allowClear={false}
          />
          <Select
            options={teamOptions}
            value={selectedTeam}
            onChange={setSelectedTeam}
            label="Team"
            className="w-40"
          />
        </div>
        <div className="filter-timestamp">
          <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Updated just now</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="reports-summary">
        <StatCard
          label="Total Initiatives"
          value={mockQuarterSummary.totalInitiatives}
          trend={12.5}
          trendData={initiativesTrend}
          delay={0}
        />
        <StatCard
          label="Total Hours"
          value={mockQuarterSummary.totalHours}
          unit="h"
          trend={8.3}
          trendData={hoursTrend}
          delay={50}
        />
        <StatCard
          label="Capacity Utilization"
          value={mockQuarterSummary.capacityUtilization}
          unit="%"
          trend={mockQuarterSummary.trend}
          trendData={utilizationTrend}
          delay={100}
        />
        <div className="report-stat-card utilization-gauge" style={{ animationDelay: '150ms' }}>
          <span className="stat-label">Health Score</span>
          <div className="gauge-container">
            <svg viewBox="0 0 120 70" className="gauge-svg">
              {/* Background arc */}
              <path
                d="M 15 60 A 45 45 0 0 1 105 60"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                className="text-surface-200"
              />
              {/* Colored segments */}
              <path
                d="M 15 60 A 45 45 0 0 1 105 60"
                fill="none"
                stroke="url(#gaugeGradient)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="141.4"
                strokeDashoffset={141.4 * (1 - 0.72)}
              />
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#059669" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
              {/* Needle */}
              <line
                x1="60"
                y1="60"
                x2="60"
                y2="20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-surface-800"
                transform="rotate(50, 60, 60)"
              />
              <circle cx="60" cy="60" r="4" fill="currentColor" className="text-surface-800" />
            </svg>
            <div className="gauge-value-label">
              <span className="text-2xl font-display font-bold text-surface-900">72</span>
              <span className="text-xs text-surface-500">/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="reports-grid">
        <SkillGapsCard data={mockSkillGaps} />
        <OverallocatedCard data={mockOverallocated} />
        <DeliveryForecastCard data={mockDeliveryItems} />
        <ScenarioComparisonCard
          scenarios={mockScenarios}
          selectedIds={comparisonScenarios}
          onSelect={setComparisonScenarios}
        />
      </div>
    </div>
  );
}
