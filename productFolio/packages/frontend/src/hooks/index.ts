// Auth hooks
export {
  useCurrentUser,
  useLogin,
  useLogout,
  useChangePassword,
  useRegisterUser,
  authKeys,
} from './useAuth';

// Initiative hooks
export {
  useInitiatives,
  useInitiative,
  useInitiativeAllocationsAll,
  useInitiativeAllocationHours,
  useInitiativeAllocationHoursByType,
  useCreateInitiative,
  useUpdateInitiative,
  useUpdateInitiativeStatus,
  useBulkUpdateStatus,
  useDeleteInitiative,
  useBulkDeleteInitiatives,
  useExportInitiatives,
  useImportInitiatives,
  initiativeKeys,
} from './useInitiatives';

// Portfolio Area hooks
export {
  usePortfolioAreas,
  useCreatePortfolioArea,
  useUpdatePortfolioArea,
  useDeletePortfolioArea,
  portfolioAreaKeys,
} from './usePortfolioAreas';

// Employee hooks
export {
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useEmployeeSkills,
  useAddSkill,
  useUpdateSkill,
  useRemoveSkill,
  useEmployeeCapacity,
  useUpdateCapacity,
  useEmployeeAvailability,
  useEmployeeAllocationSummaries,
  useEmployeePtoHours,
  employeeKeys,
  type Employee,
  type EmployeeFilters,
  type Skill,
  type CapacityEntry,
  type Availability,
  type QuarterAllocationSummary,
  type AllocationSummariesResponse,
} from './useEmployees';

// Scenario hooks
export {
  useScenarios,
  useScenario,
  useScenarioAllocations,
  useScenarioAnalysis,
  useScenarioCalculator,
  useCompareScenarios,
  useCreateScenario,
  useUpdateScenario,
  useDeleteScenario,
  useUpdatePriorities,
  useCloneScenario,
  useCreateAllocation,
  useUpdateAllocation,
  useDeleteAllocation,
  useInvalidateCalculatorCache,
  scenarioKeys,
  type Scenario,
  type Allocation,
  type CapacityAnalysis,
  type CalculatorResult,
  type ScenarioComparison,
} from './useScenarios';

// Scoping hooks
export {
  useScopeItems,
  useScopeItem,
  useCreateScopeItem,
  useUpdateScopeItem,
  useDeleteScopeItem,
  useSubmitForApproval,
  useApproveInitiative,
  useRejectInitiative,
  useApprovalHistory,
  scopingKeys,
  type ScopeItem,
  type ApprovalHistoryEntry,
} from './useScoping';

// Period hooks
export {
  useQuarterPeriods,
  getQuarterPeriodIds,
  deriveQuarterRange,
  periodKeys,
  type Period,
} from './usePeriods';

// Route prefetch hooks
export { useRoutePrefetch, usePrefetchOnHover } from './useRoutePrefetch';

// Accessibility hooks
export { useFocusTrap } from './useFocusTrap';
export { useKeyboardShortcuts, formatShortcut, type KeyboardShortcut } from './useKeyboardShortcuts';

// Jira integration hooks
export {
  useJiraConnections,
  useConnectJira,
  useDisconnectJira,
  useJiraSites,
  useSelectSites,
  useJiraProjects,
  useSelectProjects,
  useSyncStatus,
  useSyncRuns,
  useTriggerSync,
  jiraKeys,
} from './useJiraIntegration';

// Intake hooks
export {
  useIntakeItems,
  useIntakeItem,
  useIntakeStats,
  intakeKeys,
} from './useIntake';

// Feature flag hooks
export {
  useFeatureFlags,
  useFeatureFlag,
  useUpdateFeatureFlag,
  featureFlagKeys,
  type FeatureFlag,
} from './useFeatureFlags';

// Job profile hooks
export {
  useJobProfiles,
  useJobProfile,
  useCreateJobProfile,
  useUpdateJobProfile,
  useDeleteJobProfile,
  useAssignJobProfile,
  jobProfileKeys,
  type JobProfile,
  type JobProfileSkill,
  type CostBand,
  type JobProfileFilters,
} from './useJobProfiles';

// Org capacity hooks
export {
  useOrgCapacity,
  useOrgNodeEmployees,
  orgCapacityKeys,
} from './useOrgCapacity';

// Forecast hooks
export {
  useRunScopeBasedForecast,
  useRunEmpiricalForecast,
  useDataQuality,
  useForecastRuns,
  useForecastRun,
  forecastKeys,
} from './useForecast';

// Types from central types file
export type {
  Initiative,
  InitiativeStatus,
  InitiativeAllocation,
  InitiativeAllocationHours,
  InitiativeAllocationHoursByType,
  InitiativeFilters,
  PaginatedResponse,
  BulkUpdateResult,
  PortfolioArea,
} from '../types';

// Types from intake types
export type {
  IntakeItem,
  IntakeStats,
  IntakeFilters,
  JiraConnection,
  JiraSite,
  JiraProject,
  SyncStatus,
  SyncRun,
} from '../types/intake';
