# Integration Map (Planning Stack v1)

## Supply (existing)
Employee -> CapacityCalendar(periodId) -> hoursAvailable
Employee -> Skill[] -> { name, proficiency }
Scenario -> AllocationPeriod -> hoursInPeriod, rampModifier

## Demand (existing)
Initiative -> ScopeItem[] -> skillDemand, estimateP50, estimateP90
ScopeItem -> ScopeItemPeriodDistribution(periodId) -> distribution

## Org Tree (formalized in schema)
OrgNode (self-ref tree, materialized path) -> OrgMembership -> Employee
OrgNode -> ApprovalPolicy -> chain resolution via ancestor walk
Employee.orgMemberships[] -> temporal org assignment
Employee.managedOrgNodes[] -> manager role on nodes
AuditEvent -> actor (User) -- cross-cutting audit trail

## Approval Workflow (formalized in schema)
ApprovalPolicy -> OrgNode (org-scoped rules)
ApprovalRequest -> User (requester), ApprovalDecision[] (chain steps)
ApprovalDelegation -> User (delegator/delegate), OrgNode? (scoped delegation)

## Feature Flags (new)
FeatureFlag { key, enabled } -> gates: org_capacity_view, job_profiles, flow_forecast_v1, forecast_mode_b

## Job Profiles (new)
JobProfile -> JobProfileSkill[] -> { skillName, expectedProficiency }
JobProfile -> CostBand? -> { annualCostMin, annualCostMax, hourlyRate, currency }
Employee.jobProfileId? -> JobProfile (optional FK for reporting + budget)

## Forecasting (new)
ForecastRun { mode: SCOPE_BASED | EMPIRICAL } -> stores simulation results as JSONB
  - scenarioId? -> scope to a specific scenario
  - orgNodeId? -> scope to an org subtree
  - initiativeIds -> targeted initiatives
  - results, warnings, dataQuality -> output JSONB blobs

## Initiative Status Log (new)
InitiativeStatusLog -> Initiative (FK)
  - fromStatus, toStatus (InitiativeStatus enum)
  - transitionedAt, actorId?
  - Feeds Mode B (empirical) forecasting with historical throughput data

## Integration points
- Org Scope: filters employees + initiatives via OrgNode subtree, does not change supply/demand sources
- Job Profiles: attach to Employee, used for reporting + budget; skills compiled to skillDemand
- Forecasting (Mode A): uses ScopeItem.estimateP50/P90 + period distributions
- Forecasting (Mode B): uses InitiativeStatusLog transition times for empirical cycle-time data
- Feature flags gate all new UI pages and backend routes
