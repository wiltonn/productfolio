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
  useCreateInitiative,
  useUpdateInitiative,
  useUpdateInitiativeStatus,
  useBulkUpdateStatus,
  useBulkAddTags,
  useDeleteInitiative,
  useBulkDeleteInitiatives,
  useExportInitiatives,
  useImportInitiatives,
  initiativeKeys,
} from './useInitiatives';

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
  employeeKeys,
  type Employee,
  type EmployeeFilters,
  type Skill,
  type CapacityEntry,
  type Availability,
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

// Route prefetch hooks
export { useRoutePrefetch, usePrefetchOnHover } from './useRoutePrefetch';

// Accessibility hooks
export { useFocusTrap } from './useFocusTrap';
export { useKeyboardShortcuts, formatShortcut, type KeyboardShortcut } from './useKeyboardShortcuts';

// Types from central types file
export type {
  Initiative,
  InitiativeStatus,
  InitiativeFilters,
  PaginatedResponse,
  BulkUpdateResult,
} from '../types';
