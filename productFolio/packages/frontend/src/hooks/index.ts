// Auth hooks
export {
  useCurrentUser,
  useLogout,
  authKeys,
} from './useAuth';

// Authorization hooks
export { useAuthz } from './useAuthz';

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

// Portfolio area node hooks
export {
  usePortfolioAreaNodes,
  portfolioAreaNodeKeys,
} from './usePortfolioAreaNodes';

// Org capacity hooks
export {
  useOrgCapacity,
  useOrgNodeEmployees,
  orgCapacityKeys,
} from './useOrgCapacity';

// Planning mode hooks
export {
  usePlanningModeToggle,
  planningModeKeys,
  type PlanningMode,
} from './usePlanningMode';

// Token ledger hooks
export {
  useTokenLedger,
  useSkillPools,
  useTokenSupply,
  useTokenDemand,
  useUpdateTokenSupply,
  useUpdateTokenDemand,
  useDeriveTokenDemand,
  tokenLedgerKeys,
  type TokenLedgerRow,
  type TokenLedgerSummary,
  type SkillPool,
  type TokenSupplyEntry,
  type TokenDemandEntry,
} from './useTokenLedger';

// Forecast hooks
export {
  useRunScopeBasedForecast,
  useRunEmpiricalForecast,
  useDataQuality,
  useForecastRuns,
  useForecastRun,
  forecastKeys,
} from './useForecast';

// Entitlement hooks
export {
  useEntitlementSummary,
  useEntitlements,
  useUpdateTenantConfig,
  useRevOpsSummary,
  useRevOpsEvents,
  entitlementKeys,
  type EntitlementSummary,
  type EntitlementUser,
  type EntitlementLists,
  type TenantConfigUpdate,
  type RevOpsSignals,
  type EntitlementEvent,
  type EntitlementEventFilters,
} from './useEntitlements';

// User hooks
export {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
  userKeys,
  type User as AdminUser,
  type UserDetail,
  type UsersResponse as AdminUsersResponse,
  type UserFilters as AdminUserFilters,
  type CreateUserInput,
  type UpdateUserInput,
  type UserRole as AdminUserRole,
  type SeatType as AdminSeatType,
} from './useUsers';

// Approval status hooks
export {
  useApprovalStatus,
  useRequestApproval,
  approvalStatusKeys,
  type ApprovalStatusResult,
} from './useApprovalStatus';

// Employee Org Links (Matrix Org) hooks
export {
  useEmployeeOrgLinks,
  useActiveEmployeeLinks,
  useEmployeeHomeOrg,
  useEmployeeLinkHistory,
  useEmployeeCapacityLinks,
  useOrgNodeLinks,
  useCreateEmployeeOrgLink,
  useUpdateEmployeeOrgLink,
  useEndEmployeeOrgLink,
  useReassignPrimaryReporting,
  useMigrateFromMemberships,
  employeeOrgLinkKeys,
  type LinkListFilters,
  type CreateLinkInput,
} from './useEmployeeOrgLinks';

// Auth0 admin hooks
export { useSyncRoles, useSyncAllUsers, useSyncUser } from './useAuth0Admin';

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

// Rollup hooks
export {
  usePortfolioAreaRollup,
  useOrgNodeRollup,
  useBusinessOwnerRollup,
  rollupKeys,
} from './useRollups';

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
