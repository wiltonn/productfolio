  ---                                                                                                                                                  
  1. Executive Summary                                                                                                                                 
                                                                                                                                                       
  When employees move between initiatives, they don't produce at full speed immediately. They need to learn the data sources, business rules, and      
  regulatory context of their new assignment. Today, ProductFolio's scenario planner ignores this cost: headcount looks sufficient, but delivery slips 
  because half the team is still learning.                                                                                                             
                                                                                                                                                       
  This design adds ramp-up modeling to scenarios. Each initiative declares how complex its domain is. The system tracks which employees have worked on 
  which initiatives before. When someone new is assigned, their effective hours are automatically reduced during the ramp period. The result: scenario 
  plans that reflect reality — where moving people around has a measurable cost, and keeping teams stable has a quantifiable benefit.                  
                                                                                                                                                       
  For Mike's demo: the Scenario Planner will show a new "Ramp Cost" pill reading something like "340h lost to ramp." Clicking into it reveals which    
  employees are ramping and on which initiatives. Comparing two scenarios side-by-side shows that one costs 200 fewer ramp hours because it reuses     
  employees from last quarter. No data model explanation required — it just reads as "this plan is more expensive because you're shuffling people."    
                                                                                                                                                       
  ---                                                                                                                                                  
  2. Conceptual Model                                                                                                                                  
                                                                                                                                                       
  Two Distinct Ramp Types                                                                                                                              
  ┌───────────────────────────────┬─────────────────────────────┬──────────────────────────────────────────────────┐                                   
  │           Property            │        Skill Ramp-Up        │                  Domain Ramp-Up                  │                                   
  ├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────┤                                   
  │ Owned by                      │ Employee                    │ Initiative × Employee pair                       │                                   
  ├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────┤                                   
  │ Transfers across initiatives? │ Yes                         │ No                                               │                                   
  ├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────┤                                   
  │ Decay                         │ Slow (skills persist)       │ Medium (domain knowledge fades if not exercised) │                                   
  ├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────┤                                   
  │ Already modeled?              │ Partially (proficiency 1-5) │ Not at all                                       │                                   
  ├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────┤                                   
  │ Priority                      │ Phase 2                     │ Phase 1                                          │                                   
  └───────────────────────────────┴─────────────────────────────┴──────────────────────────────────────────────────┘                                   
  Skill ramp-up is already approximated by the existing Skill.proficiency field (1–5 → 0.2–1.0 multiplier). The gap is that proficiency is static      
  within a quarter — it doesn't model someone who's a 2 in January but a 4 by March. This is a refinement, not a blocker.                              
                                                                                                                                                       
  Domain ramp-up is the unsolved problem. When Employee A moves from Initiative X to Initiative Y, they carry their skills but lose domain context.    
  Initiative Y has different data sources, business rules, legacy integrations, and regulatory constraints. This cost is:                              
  - Front-loaded: worst in month 1, improving by month 3                                                                                               
  - Initiative-specific: complexity varies widely across initiatives                                                                                   
  - Historically derivable: if someone worked on Initiative Y last quarter (in a locked scenario), they've already ramped                              
                                                                                                                                                       
  Where Attributes Live                                                                                                                                
                                                                                                                                                       
  Employee ──owns──> Skills (with proficiency)                                                                                                         
                     EmployeeDomainFamiliarity (per initiative)                                                                                        
                                                                                                                                                       
  Initiative ──owns──> domainComplexity (LOW / MEDIUM / HIGH / VERY_HIGH)                                                                              
                       onboardingReadiness (0.0–1.0)                                                                                                   
                                                                                                                                                       
  Scenario ──owns──> rampProfiles (assumption, per complexity level)                                                                                   
                     rampEnabled (boolean assumption)                                                                                                  
                                                                                                                                                       
  AllocationPeriod ──computed──> rampModifier (0.0–1.0)                                                                                                
                                 rampBreakdown (JSON: { domain, skill, onboarding })                                                                   
                                                                                                                                                       
  Core Invariant                                                                                                                                       
                                                                                                                                                       
  Ramp-up is a multiplier on effective hours, not a separate resource pool. It plugs into the existing formula:                                        
                                                                                                                                                       
  effectiveHours = allocatedHours × proficiencyMultiplier × bufferMultiplier × rampModifier                                                            
                                                                                ^^^^^^^^^^^                                                            
                                                                                NEW                                                                    
                                                                                                                                                       
  This means all downstream consumers (gap analysis, shortage detection, skill mismatch, summary stats, baseline snapshots) automatically incorporate  
  ramp costs without code changes to their aggregation logic.                                                                                          
                                                                                                                                                       
  ---                                                                                                                                                  
  3. Data Model Changes                                                                                                                                
                                                                                                                                                       
  3.1 New Field on Initiative                                                                                                                          
                                                                                                                                                       
  model Initiative {                                                                                                                                   
    // ... existing fields ...                                                                                                                         
    domainComplexity    DomainComplexity  @default(MEDIUM)                                                                                             
    onboardingReadiness Float             @default(0.0)  // 0.0–1.0                                                                                    
  }                                                                                                                                                    
                                                                                                                                                       
  enum DomainComplexity {                                                                                                                              
    LOW                                                                                                                                                
    MEDIUM                                                                                                                                             
    HIGH                                                                                                                                               
    VERY_HIGH                                                                                                                                          
  }                                                                                                                                                    
  Property: Lives on                                                                                                                                   
  Detail: Initiative                                                                                                                                   
  ────────────────────────────────────────                                                                                                             
  Property: Immutable when locked?                                                                                                                     
  Detail: No — this is an initiative property, not a scenario property. Changing it triggers cache invalidation on any DRAFT/REVIEW scenario           
  referencing                                                                                                                                          
     the initiative.                                                                                                                                   
  ────────────────────────────────────────                                                                                                             
  Property: BaselineSnapshot interaction                                                                                                               
  Detail: The snapshot already captures initiativeTitle. Add domainComplexity and onboardingReadiness to DemandSnapshotEntry so the locked snapshot is 
    self-contained.                                                                                                                                    
  ────────────────────────────────────────                                                                                                             
  Property: Default                                                                                                                                    
  Detail: MEDIUM / 0.0 — existing initiatives are unaffected until explicitly classified.                                                              
  3.2 New Junction Table: EmployeeDomainFamiliarity                                                                                                    
                                                                                                                                                       
  model EmployeeDomainFamiliarity {                                                                                                                    
    id              String    @id @default(uuid())                                                                                                     
    employeeId      String                                                                                                                             
    initiativeId    String                                                                                                                             
    familiarityLevel Float    @default(0.0)  // 0.0 = no familiarity, 1.0 = fully ramped                                                               
    source          FamiliaritySource @default(MANUAL)                                                                                                 
    lastAllocatedPeriodId String?                                                                                                                      
    updatedAt       DateTime @updatedAt                                                                                                                
                                                                                                                                                       
    employee   Employee   @relation(fields: [employeeId], references: [id])                                                                            
    initiative Initiative @relation(fields: [initiativeId], references: [id])                                                                          
                                                                                                                                                       
    @@unique([employeeId, initiativeId])                                                                                                               
  }                                                                                                                                                    
                                                                                                                                                       
  enum FamiliaritySource {                                                                                                                             
    MANUAL           // Admin/PM set it                                                                                                                
    HISTORICAL       // Derived from locked scenario allocations                                                                                       
    ONBOARDING       // Inferred from onboarding completion signal                                                                                     
  }                                                                                                                                                    
  Property: Lives on                                                                                                                                   
  Detail: Employee × Initiative junction                                                                                                               
  ────────────────────────────────────────                                                                                                             
  Property: Immutable when locked?                                                                                                                     
  Detail: No — this is a reference data table, not a scenario table. It's read at calculation time. The computed rampModifier on AllocationPeriod is   
    what gets frozen.                                                                                                                                  
  ────────────────────────────────────────                                                                                                             
  Property: BaselineSnapshot interaction                                                                                                               
  Detail: When a BASELINE scenario is LOCKED, the system should auto-update familiarity records: any employee allocated >50% to an initiative in the   
    locked scenario gets familiarityLevel set to 1.0, source HISTORICAL, and lastAllocatedPeriodId set. This is the "learning compounds"               
    mechanism.                                                                                                                                         
  ────────────────────────────────────────                                                                                                             
  Property: Decay                                                                                                                                      
  Detail: If lastAllocatedPeriodId is >2 quarters old, familiarity decays: effectiveFamiliarity = familiarityLevel × max(0.3, 1 - (quartersSince - 2) ×
                                                                                                                                                       
    0.2). This models knowledge fading for employees who haven't touched an initiative recently.                                                       
  3.3 New Fields on AllocationPeriod                                                                                                                   
                                                                                                                                                       
  model AllocationPeriod {                                                                                                                             
    // ... existing fields ...                                                                                                                         
    rampModifier    Float   @default(1.0)  // 0.0–1.0, computed                                                                                        
    rampBreakdown   Json?   // { domainModifier, skillModifier, onboardingAdjustment, complexity }                                                     
  }                                                                                                                                                    
  Property: Lives on                                                                                                                                   
  Detail: AllocationPeriod (junction of Allocation × Period)                                                                                           
  ────────────────────────────────────────                                                                                                             
  Property: Immutable when locked?                                                                                                                     
  Detail: Yes — once the parent scenario is LOCKED, these values are frozen. They're also captured in the AllocationSnapshot JSON.                     
  ────────────────────────────────────────                                                                                                             
  Property: Computed                                                                                                                                   
  Detail: Recalculated whenever allocation is created/updated, or when ramp-related inputs change. Triggers same cache invalidation as any             
    AllocationPeriod change.                                                                                                                           
  3.4 Scenario Assumptions Extension                                                                                                                   
                                                                                                                                                       
  Add to the existing assumptions JSON field on Scenario:                                                                                              
                                                                                                                                                       
  interface ScenarioAssumptions {                                                                                                                      
    // ... existing ...                                                                                                                                
    bufferPercentage: number;                                                                                                                          
    allocationCapPercentage: number;                                                                                                                   
    proficiencyWeightEnabled: boolean;                                                                                                                 
                                                                                                                                                       
    // NEW                                                                                                                                             
    rampEnabled: boolean;                    // default: true                                                                                          
    rampProfiles: Record<DomainComplexity, number[]>;  // monthly multipliers per quarter                                                              
    onboardingImpactEnabled: boolean;        // default: false (Phase 2)                                                                               
  }                                                                                                                                                    
                                                                                                                                                       
  Default rampProfiles:                                                                                                                                
                                                                                                                                                       
  {                                                                                                                                                    
    "LOW":       [0.85, 0.95, 1.0],                                                                                                                    
    "MEDIUM":    [0.65, 0.85, 1.0],                                                                                                                    
    "HIGH":      [0.50, 0.70, 0.90],                                                                                                                   
    "VERY_HIGH": [0.35, 0.55, 0.75]                                                                                                                    
  }                                                                                                                                                    
                                                                                                                                                       
  Each array has 3 elements representing months 1, 2, 3 of the quarter. The quarterly ramp modifier is their average.                                  
  ┌────────────┬─────────┬─────────┬─────────┬─────────────┬───────────────────┐                                                                       
  │ Complexity │ Month 1 │ Month 2 │ Month 3 │ Quarter Avg │ Quarterly Penalty │                                                                       
  ├────────────┼─────────┼─────────┼─────────┼─────────────┼───────────────────┤                                                                       
  │ LOW        │ 85%     │ 95%     │ 100%    │ 93.3%       │ ~7%               │                                                                       
  ├────────────┼─────────┼─────────┼─────────┼─────────────┼───────────────────┤                                                                       
  │ MEDIUM     │ 65%     │ 85%     │ 100%    │ 83.3%       │ ~17%              │                                                                       
  ├────────────┼─────────┼─────────┼─────────┼─────────────┼───────────────────┤                                                                       
  │ HIGH       │ 50%     │ 70%     │ 90%     │ 70.0%       │ 30%               │                                                                       
  ├────────────┼─────────┼─────────┼─────────┼─────────────┼───────────────────┤                                                                       
  │ VERY_HIGH  │ 35%     │ 55%     │ 75%     │ 55.0%       │ 45%               │                                                                       
  └────────────┴─────────┴─────────┴─────────┴─────────────┴───────────────────┘                                                                       
  These are defensible heuristics based on typical knowledge worker productivity curves for domain onboarding. They can be overridden per scenario for 
  what-if analysis (e.g., "what if HIGH domains only cost 20%?").                                                                                      
                                                                                                                                                       
  ---                                                                                                                                                  
  4. Calculation Flow (Step-by-Step)                                                                                                                   
                                                                                                                                                       
  4.1 Ramp Modifier Computation                                                                                                                        
                                                                                                                                                       
  Trigger: Whenever an allocation is created or updated (allocationService.create(), allocationService.update(),                                       
  allocationService.applyAutoAllocate()), after computeAllocationPeriods() runs.                                                                       
                                                                                                                                                       
  Steps:                                                                                                                                               
                                                                                                                                                       
  computeRampModifier(allocation, period, scenario):                                                                                                   
                                                                                                                                                       
  1. IF scenario.assumptions.rampEnabled === false                                                                                                     
       → rampModifier = 1.0, done                                                                                                                      
                                                                                                                                                       
  2. FETCH EmployeeDomainFamiliarity for (allocation.employeeId, allocation.initiativeId)                                                              
       → If not found, familiarityLevel = 0.0                                                                                                          
                                                                                                                                                       
  3. APPLY decay if lastAllocatedPeriodId is stale:                                                                                                    
       quartersSince = periodsElapsed(familiarity.lastAllocatedPeriodId, period.id)                                                                    
       IF quartersSince > 2:                                                                                                                           
         effectiveFamiliarity = familiarityLevel × max(0.3, 1 - (quartersSince - 2) × 0.2)                                                             
       ELSE:                                                                                                                                           
         effectiveFamiliarity = familiarityLevel                                                                                                       
                                                                                                                                                       
  4. IF effectiveFamiliarity >= 1.0                                                                                                                    
       → rampModifier = 1.0, done (fully familiar, no ramp needed)                                                                                     
                                                                                                                                                       
  5. FETCH initiative.domainComplexity (default: MEDIUM)                                                                                               
                                                                                                                                                       
  6. LOOKUP rampProfile = scenario.assumptions.rampProfiles[domainComplexity]                                                                          
       → e.g., [0.50, 0.70, 0.90] for HIGH                                                                                                             
                                                                                                                                                       
  7. COMPUTE baseRampModifier = average(rampProfile)                                                                                                   
       → e.g., (0.50 + 0.70 + 0.90) / 3 = 0.70                                                                                                         
                                                                                                                                                       
  8. BLEND with familiarity:                                                                                                                           
       domainRampModifier = effectiveFamiliarity + (1 - effectiveFamiliarity) × baseRampModifier                                                       
       // If familiarityLevel = 0.0: domainRampModifier = 0.70 (full ramp penalty)                                                                     
       // If familiarityLevel = 0.5: domainRampModifier = 0.50 + 0.50 × 0.70 = 0.85 (half penalty)                                                     
       // If familiarityLevel = 1.0: domainRampModifier = 1.0 (no penalty)                                                                             
                                                                                                                                                       
  9. (Phase 2) APPLY onboarding readiness adjustment:                                                                                                  
       IF scenario.assumptions.onboardingImpactEnabled:                                                                                                
         onboardingBoost = (1 - domainRampModifier) × initiative.onboardingReadiness × 0.5                                                             
         domainRampModifier += onboardingBoost                                                                                                         
         // Good onboarding (readiness=0.8) cuts remaining penalty by 40%                                                                              
                                                                                                                                                       
  10. CLAMP rampModifier to [0.1, 1.0]                                                                                                                 
                                                                                                                                                       
  11. STORE on AllocationPeriod:                                                                                                                       
        rampModifier = domainRampModifier                                                                                                              
        rampBreakdown = {                                                                                                                              
          domainModifier: domainRampModifier,                                                                                                          
          effectiveFamiliarity,                                                                                                                        
          complexity: initiative.domainComplexity,                                                                                                     
          onboardingAdjustment: onboardingBoost ?? 0,                                                                                                  
          rampProfile                                                                                                                                  
        }                                                                                                                                              
                                                                                                                                                       
  4.2 Integration into ScenarioCalculatorService.calculateCapacity()                                                                                   
                                                                                                                                                       
  The change is exactly one line in the existing loop at scenario-calculator.service.ts:416-417:                                                       
                                                                                                                                                       
  Before:                                                                                                                                              
  const effectiveHours = allocatedHours * proficiencyMultiplier * bufferMultiplier;                                                                    
                                                                                                                                                       
  After:                                                                                                                                               
  const rampModifier = this.getRampModifierForAllocation(alloc, periodId);                                                                             
  const effectiveHours = allocatedHours * proficiencyMultiplier * bufferMultiplier * rampModifier;                                                     
                                                                                                                                                       
  Where getRampModifierForAllocation reads the pre-computed rampModifier from the AllocationPeriod junction row:                                       
                                                                                                                                                       
  private getRampModifierForAllocation(                                                                                                                
    allocation: AllocWithPeriods,                                                                                                                      
    periodId: string                                                                                                                                   
  ): number {                                                                                                                                          
    const ap = allocation.allocationPeriods.find(p => p.periodId === periodId);                                                                        
    return ap?.rampModifier ?? 1.0;                                                                                                                    
  }                                                                                                                                                    
                                                                                                                                                       
  This is a read of an already-computed field, not a calculation — so it adds zero latency to the calculation path. The ramp modifier is pre-computed  
  when allocations are created/updated.                                                                                                                
                                                                                                                                                       
  4.3 Cache Invalidation                                                                                                                               
                                                                                                                                                       
  Existing triggers remain unchanged. Additional triggers:                                                                                             
  Event: Initiative.domainComplexity changes                                                                                                           
  Action: Invalidate all DRAFT/REVIEW scenarios containing that initiative. Recompute ramp modifiers for affected allocations.                         
  ────────────────────────────────────────                                                                                                             
  Event: EmployeeDomainFamiliarity created/updated                                                                                                     
  Action: Invalidate scenarios where that employee is allocated to that initiative.                                                                    
  ────────────────────────────────────────                                                                                                             
  Event: Initiative.onboardingReadiness changes                                                                                                        
  Action: Same as domainComplexity.                                                                                                                    
  ────────────────────────────────────────                                                                                                             
  Event: scenario.assumptions.rampProfiles changes                                                                                                     
  Action: Invalidate that scenario. Recompute all ramp modifiers.                                                                                      
  ────────────────────────────────────────                                                                                                             
  Event: Baseline LOCKED (familiarity auto-update)                                                                                                     
  Action: Invalidate downstream DRAFT scenarios for the next quarter.                                                                                  
  All of these flow through the existing scenarioCalculatorService.invalidateCache(scenarioId) + enqueueScenarioRecompute() pipeline.                  
                                                                                                                                                       
  4.4 Downstream Consumers — No Changes Required                                                                                                       
                                                                                                                                                       
  Because rampModifier reduces effectiveHours at the source, these consumers automatically reflect ramp costs:                                         
                                                                                                                                                       
  - Gap analysis: gap = capacityHours - demandHours → capacity is lower, gaps appear larger                                                            
  - Shortage detection: severity thresholds apply to the reduced capacity                                                                              
  - Overallocation detection: unchanged (operates on percentage, not hours)                                                                            
  - Skill mismatch detection: unchanged                                                                                                                
  - Summary stats: totalUsedCapacity and utilizationPercent reflect ramped numbers                                                                     
  - Baseline snapshots: allocationSnapshot includes hoursInPeriod which is already the final effective number; add rampModifier to the snapshot entry  
  for audit                                                                                                                                            
                                                                                                                                                       
  ---                                                                                                                                                  
  5. Auto-Allocate Behavior                                                                                                                            
                                                                                                                                                       
  5.1 Current Algorithm (unchanged core)                                                                                                               
                                                                                                                                                       
  1. Sort initiatives by priority rank                                                                                                                 
  2. For each initiative, aggregate skill demand                                                                                                       
  3. For each skill, iterate employees sorted by proficiency descending                                                                                
  4. Assign capacity greedily                                                                                                                          
                                                                                                                                                       
  5.2 Changes: Familiarity-Aware Sorting                                                                                                               
                                                                                                                                                       
  Replace the single sort key (proficiency descending) with a composite score:                                                                         
                                                                                                                                                       
  // Current (allocation.service.ts:1084-1086)                                                                                                         
  emps.sort((a, b) => b.proficiency - a.proficiency);                                                                                                  
                                                                                                                                                       
  // Proposed                                                                                                                                          
  emps.sort((a, b) => {                                                                                                                                
    const famA = getDomainFamiliarity(a.employeeId, initiativeId);                                                                                     
    const famB = getDomainFamiliarity(b.employeeId, initiativeId);                                                                                     
    const scoreA = a.proficiency * (0.6 + 0.4 * famA);                                                                                                 
    const scoreB = b.proficiency * (0.6 + 0.4 * famB);                                                                                                 
    return scoreB - scoreA;                                                                                                                            
  });                                                                                                                                                  
                                                                                                                                                       
  Effect: An employee with proficiency 4 and full familiarity (score: 4.0) beats an employee with proficiency 5 and no familiarity (score: 3.0). This  
  reflects the reality that a domain-familiar level-4 engineer outproduces an unfamiliar level-5 engineer for the first quarter.                       
                                                                                                                                                       
  The 60/40 weighting means proficiency still dominates — a proficiency-5 unfamiliar employee (3.0) still beats a proficiency-3 familiar employee      
  (2.4). This prevents the system from locking low-skill employees into initiatives forever just because they worked there once.                       
                                                                                                                                                       
  5.3 Effective Hours in Auto-Allocate                                                                                                                 
                                                                                                                                                       
  Currently, auto-allocate computes raw hours:                                                                                                         
  const actualHours = totalPossibleHours * (actualPct / 100);                                                                                          
                                                                                                                                                       
  With ramp enabled, it should compute effective hours against demand:                                                                                 
  const rampMod = computeRampModifier(empEntry.employeeId, initiative.id, scenario);                                                                   
  const effectiveHours = totalPossibleHours * (actualPct / 100) * rampMod;                                                                             
                                                                                                                                                       
  This means the algorithm allocates more percentage to unfamiliar employees to compensate for ramp loss, or surfaces a warning when compensation isn't
   possible.                                                                                                                                           
                                                                                                                                                       
  5.4 New Warnings                                                                                                                                     
                                                                                                                                                       
  Add to the existing warnings array:                                                                                                                  
                                                                                                                                                       
  "Employee Alice Chen assigned to Initiative Beta with no domain familiarity.                                                                         
   Ramp-up reduces effective capacity by ~30% (HIGH complexity).                                                                                       
   Effective hours: 364 of 520 allocated."                                                                                                             
                                                                                                                                                       
  "Initiative Gamma has 4 of 5 assigned employees with no domain familiarity.                                                                          
   Collective ramp cost: 680h. Consider retaining experienced team members."                                                                           
                                                                                                                                                       
  "Coverage for Initiative Delta appears 100% by headcount but only 72% by                                                                             
   effective hours after ramp-up. Delivery timeline may be affected."                                                                                  
                                                                                                                                                       
  The last warning is critical — it addresses the "looks green but isn't" problem directly.                                                            
                                                                                                                                                       
  5.5 Coverage Reporting                                                                                                                               
                                                                                                                                                       
  Extend InitiativeCoverage to include:                                                                                                                
                                                                                                                                                       
  interface InitiativeCoverage {                                                                                                                       
    // ... existing ...                                                                                                                                
    rawCoveragePercent: number;       // headcount-based (existing field, renamed)                                                                     
    effectiveCoveragePercent: number;  // after ramp modifiers                                                                                         
    rampCostHours: number;            // total hours lost to ramp                                                                                      
    newEmployeeCount: number;         // count of employees with familiarity < 0.5                                                                     
  }                                                                                                                                                    
                                                                                                                                                       
  ---                                                                                                                                                  
  6. UI / UX Implications                                                                                                                              
                                                                                                                                                       
  6.1 Scenario Planner — Header Summary Pills                                                                                                          
                                                                                                                                                       
  Current pills: Demand | Available | Allocated | Util. | Gaps                                                                                         
                                                                                                                                                       
  Add one new pill:                                                                                                                                    
  ┌───────────┬───────────────────┬────────────────────────────────────────┐                                                                           
  │   Pill    │       Value       │              Color Logic               │                                                                           
  ├───────────┼───────────────────┼────────────────────────────────────────┤                                                                           
  │ Ramp Cost │ {totalRampHours}h │ Amber if >5% of allocated, Red if >15% │                                                                           
  └───────────┴───────────────────┴────────────────────────────────────────┘                                                                           
  When ramp is disabled in assumptions, this pill shows "Off" in neutral gray.                                                                         
                                                                                                                                                       
  Modify existing pill:                                                                                                                                
  - Allocated pill tooltip expands to show: "5,100h raw / 4,420h effective (680h ramp cost)"                                                           
                                                                                                                                                       
  6.2 Scenario Planner — Assumptions Panel                                                                                                             
                                                                                                                                                       
  Add a new section "Ramp-Up Settings" to the existing assumptions dropdown:                                                                           
                                                                                                                                                       
  [✓] Enable ramp-up modeling                                                                                                                          
                                                                                                                                                       
  Domain Ramp Profiles:                                                                                                                                
    LOW:       [85% → 95% → 100%]  avg 93%                                                                                                             
    MEDIUM:    [65% → 85% → 100%]  avg 83%                                                                                                             
    HIGH:      [50% → 70% → 90%]   avg 70%                                                                                                             
    VERY_HIGH: [35% → 55% → 75%]   avg 55%                                                                                                             
                                                                                                                                                       
    [Reset to Defaults]                                                                                                                                
                                                                                                                                                       
  Each profile row is editable (three number inputs). The average is computed and shown.                                                               
                                                                                                                                                       
  6.3 Scenario Planner — Allocations Table                                                                                                             
                                                                                                                                                       
  Add a column to the allocations table: Ramp                                                                                                          
  ┌────────────┬───────────────┬──────┬───────┬─────────┬─────────┐                                                                                    
  │  Employee  │  Initiative   │  %   │ Hours │  Ramp   │  Type   │                                                                                    
  ├────────────┼───────────────┼──────┼───────┼─────────┼─────────┤                                                                                    
  │ Alice Chen │ Project Alpha │ 80%  │ 416h  │ 1.0     │ PROJECT │                                                                                    
  ├────────────┼───────────────┼──────┼───────┼─────────┼─────────┤                                                                                    
  │ Bob Park   │ Project Beta  │ 60%  │ 312h  │ 0.70 ⚠️ │ PROJECT │                                                                                    
  ├────────────┼───────────────┼──────┼───────┼─────────┼─────────┤                                                                                    
  │ Carol Wu   │ Project Beta  │ 100% │ 520h  │ 0.83    │ PROJECT │                                                                                    
  └────────────┴───────────────┴──────┴───────┴─────────┴─────────┘                                                                                    
  - Ramp value shown as a decimal (1.0 = no penalty)                                                                                                   
  - Values < 0.85 get an amber warning icon                                                                                                            
  - Values < 0.60 get a red warning icon                                                                                                               
  - Tooltip on the ramp value shows: "Domain complexity: HIGH. Familiarity: 0.0 (new to initiative). Effective hours: 218 of 312."                     
                                                                                                                                                       
  6.4 Scenario Planner — Initiative Cards (Left Panel)                                                                                                 
                                                                                                                                                       
  Add a small badge below existing initiative info:                                                                                                    
                                                                                                                                                       
  [3] Project Beta                    ▼ Rank 2                                                                                                         
      RESOURCING · 3 employees                                                                                                                         
      ⚠ 2 new employees · ~30% ramp cost                                                                                                               
                                                                                                                                                       
  The "2 new employees · ~30% ramp cost" line appears only when ramp-up is enabled and at least one allocated employee has familiarity < 0.5.          
                                                                                                                                                       
  6.5 Scenario Comparison Modal                                                                                                                        
                                                                                                                                                       
  Current comparison stats: Total Demand | Utilization | Skill Gaps                                                                                    
                                                                                                                                                       
  Add:                                                                                                                                                 
  ┌─────────────────────────┬────────────┬────────────┬──────────┐                                                                                     
  │         Metric          │ Scenario A │ Scenario B │  Delta   │                                                                                     
  ├─────────────────────────┼────────────┼────────────┼──────────┤                                                                                     
  │ Total Demand            │ 4,800h     │ 4,800h     │ —        │                                                                                     
  ├─────────────────────────┼────────────┼────────────┼──────────┤                                                                                     
  │ Raw Capacity            │ 5,200h     │ 5,200h     │ —        │                                                                                     
  ├─────────────────────────┼────────────┼────────────┼──────────┤                                                                                     
  │ Effective Capacity      │ 4,520h     │ 4,880h     │ +360h ✅ │                                                                                     
  ├─────────────────────────┼────────────┼────────────┼──────────┤                                                                                     
  │ Ramp Cost               │ 680h       │ 320h       │ -360h ✅ │                                                                                     
  ├─────────────────────────┼────────────┼────────────┼──────────┤                                                                                     
  │ Utilization (effective) │ 106%       │ 98%        │ -8% ✅   │                                                                                     
  ├─────────────────────────┼────────────┼────────────┼──────────┤                                                                                     
  │ Skill Gaps              │ 2          │ 1          │ -1 ✅    │                                                                                     
  └─────────────────────────┴────────────┴────────────┴──────────┘                                                                                     
  The narrative for Mike: "Scenario B saves 360 hours of ramp-up cost by keeping 3 experienced employees on their current initiatives instead of       
  rotating them."                                                                                                                                      
                                                                                                                                                       
  6.6 Natural Language Explanations                                                                                                                    
                                                                                                                                                       
  Generate on-demand (tooltip or detail panel) from ramp data:                                                                                         
                                                                                                                                                       
  "Moving Alice from Project Alpha to Project Beta adds ~156 hours of ramp-up cost this quarter. Alice has no prior experience with Beta's regulatory  
  data pipeline (HIGH complexity). She'll operate at approximately 50% productivity in month 1, improving to 90% by month 3."                          
                                                                                                                                                       
  "Keeping the current team on Project Gamma saves 420 hours compared to a fresh team. 4 of 5 team members have full domain familiarity from Q1."      
                                                                                                                                                       
  "Q2 effective capacity is 18,400h vs 22,100h raw. The 3,700h difference is ramp-up cost from 12 employees moving to new initiatives."                
                                                                                                                                                       
  These are computed from rampBreakdown JSON on AllocationPeriod — no AI or NLP required, just template strings.                                       
                                                                                                                                                       
  ---                                                                                                                                                  
  7. Phased Rollout Plan                                                                                                                               
                                                                                                                                                       
  Phase 1: Domain Ramp-Up (Demo-Ready)                                                                                                                 
                                                                                                                                                       
  Scope:                                                                                                                                               
  - Add domainComplexity field to Initiative (enum, default MEDIUM)                                                                                    
  - Add EmployeeDomainFamiliarity table (manual entry only)                                                                                            
  - Add rampModifier and rampBreakdown fields to AllocationPeriod                                                                                      
  - Add rampEnabled and rampProfiles to scenario assumptions                                                                                           
  - Modify calculateCapacity() to apply ramp modifier (one line)                                                                                       
  - Compute ramp modifiers on allocation create/update                                                                                                 
  - Add "Ramp Cost" summary pill to Scenario Planner                                                                                                   
  - Add "Ramp" column to allocations table                                                                                                             
  - Add ramp-related warnings to auto-allocate output                                                                                                  
                                                                                                                                                       
  Value: Scenarios now show the cost of team churn. Planners can see that keeping teams stable is worth quantifiable hours. What-if scenarios can      
  compare "rotate teams" vs "keep teams" with concrete numbers.                                                                                        
                                                                                                                                                       
  Risk: Low. The rampModifier defaults to 1.0, so all existing scenarios produce identical results until ramp is explicitly enabled. No migration      
  needed for historical data.                                                                                                                          
                                                                                                                                                       
  Database migration: Two new tables, two new fields on existing tables. Non-breaking, all defaults preserve current behavior.                         
                                                                                                                                                       
  Phase 2: Smart Inference + Onboarding                                                                                                                
                                                                                                                                                       
  Scope:                                                                                                                                               
  - Auto-populate EmployeeDomainFamiliarity from locked scenario history (batch job)                                                                   
  - Familiarity decay based on quarters since last allocation                                                                                          
  - Familiarity-aware auto-allocate sorting (composite score)                                                                                          
  - Effective coverage vs raw coverage in auto-allocate results                                                                                        
  - onboardingReadiness field on Initiative                                                                                                            
  - Onboarding readiness modifies ramp curve                                                                                                           
  - Initiative detail page: "Onboarding Readiness" section with external links (Jira board URL, SharePoint URL, docs URL) — stored as JSON, no document
   management                                                                                                                                          
  - Comparison modal shows effective capacity and ramp cost deltas                                                                                     
  - Natural language explanation templates                                                                                                             
                                                                                                                                                       
  Value: The system learns from history — employees who worked on an initiative last quarter automatically get credit. Onboarding investment is        
  quantified: "improving onboarding materials for Project X from 30% to 80% readiness saves 200 hours of ramp per quarter."                            
                                                                                                                                                       
  Dependency: Phase 1 must be stable. Requires at least one quarter of locked scenario data to demonstrate historical inference.                       
                                                                                                                                                       
  Phase 3: Learning Compounds Over Time                                                                                                                
                                                                                                                                                       
  Scope:                                                                                                                                               
  - Skill ramp-up modeling: EmployeeSkill.rampingFrom field to model proficiency trajectory within a quarter (time-varying proficiency multiplier)     
  - Cross-initiative domain transfer: initiatives in the same portfolio area share partial domain familiarity (e.g., two regulatory projects share 40% 
  domain overlap)                                                                                                                                      
  - Multi-quarter ramp projection: "if we keep this team for 3 quarters, here's the compound productivity gain"                                        
  - Ramp cost trend charts: quarter-over-quarter ramp costs by team/initiative                                                                         
  - Scenario recommendations: "To minimize ramp cost in Q3, lock these 8 assignments from Q2"                                                          
  - API endpoint for external systems to report onboarding completion events (webhook)                                                                 
                                                                                                                                                       
  Value: The system becomes a strategic argument for team stability. Executives can see that 6-month team commitments outperform quarterly rotations by
   quantifiable margins. Portfolio areas with good onboarding practices show measurably lower ramp costs.                                              
                                                                                                                                                       
  ---                                                                                                                                                  
  8. Risks & Guardrails                                                                                                                                
                                                                                                                                                       
  Risk: False Precision                                                                                                                                
                                                                                                                                                       
  Problem: Ramp profiles are heuristics, not measurements. Users may treat "70% effective" as ground truth.                                            
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - Label all ramp-derived numbers as "estimated" in the UI                                                                                            
  - Show ramp profiles in assumptions panel so users see they're configurable defaults                                                                 
  - Allow per-scenario overrides so teams can calibrate to their observed reality                                                                      
  - Never show ramp numbers with more than one decimal place                                                                                           
                                                                                                                                                       
  Risk: Over-Penalizing New Hires                                                                                                                      
                                                                                                                                                       
  Problem: A new employee has zero familiarity with every initiative, making them look unproductive in every scenario.                                 
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - The system penalizes reassignment, not newness. A new hire allocated to one initiative and staying there faces the same ramp as anyone else — once.
  - Auto-allocate should not avoid new hires; it should surface the ramp cost as information, not block assignment.                                    
  - Add a "New Hire" familiarity source that starts at 0.0 but doesn't carry negative signal beyond the standard ramp curve.                           
                                                                                                                                                       
  Risk: Stale Familiarity Data                                                                                                                         
                                                                                                                                                       
  Problem: If familiarity records aren't maintained, the system gives wrong estimates.                                                                 
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - Phase 2's auto-population from locked scenarios is the primary data source — no manual maintenance needed once running.                            
  - Decay function ensures stale familiarity degrades gracefully rather than persisting forever.                                                       
  - Dashboard warning: "12 familiarity records are >3 quarters old. Consider refreshing."                                                              
                                                                                                                                                       
  Risk: Breaking Locked Scenarios                                                                                                                      
                                                                                                                                                       
  Problem: Adding rampModifier to AllocationPeriod could theoretically alter locked scenario calculations.                                             
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - Migration sets rampModifier = 1.0 for all existing AllocationPeriod rows. This is a no-op mathematically.                                          
  - Locked scenarios already have their numbers captured in BaselineSnapshot JSON, which is immutable. The live calculation is only run for display    
  purposes on DRAFT/REVIEW scenarios.                                                                                                                  
  - Regression test: verify that calculateCapacity() returns identical results for all existing scenarios after migration.                             
                                                                                                                                                       
  Risk: Auto-Allocate Becomes Too Conservative                                                                                                         
                                                                                                                                                       
  Problem: Familiarity-aware sorting might concentrate work on a small set of "known" employees, leaving others underutilized.                         
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - The 60/40 weighting (proficiency 60%, familiarity 40%) ensures skill still dominates.                                                              
  - Auto-allocate warnings surface when >80% of an initiative's capacity comes from a single employee (bus factor risk).                               
  - The ramp cost is information, not a constraint — auto-allocate still fills demand, it just reports the cost honestly.                              
                                                                                                                                                       
  Risk: Performance Impact                                                                                                                             
                                                                                                                                                       
  Problem: Additional joins and computations on every allocation change.                                                                               
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - Ramp modifier is pre-computed and stored, not calculated at query time.                                                                            
  - EmployeeDomainFamiliarity lookups are indexed on (employeeId, initiativeId) composite unique.                                                      
  - The calculation adds one multiplication per allocation-period-skill triple — negligible compared to the existing loop.                             
  - Cache invalidation for ramp-related changes uses the same debounced BullMQ pipeline as existing invalidations.                                     
                                                                                                                                                       
  Risk: Onboarding Readiness Gaming                                                                                                                    
                                                                                                                                                       
  Problem: Teams might inflate onboarding readiness to make their numbers look better.                                                                 
                                                                                                                                                       
  Guardrail:                                                                                                                                           
  - Phase 2 only. By then, there's locked-scenario evidence of actual ramp patterns.                                                                   
  - Onboarding readiness is capped at reducing ramp penalty by 50% (× 0.5 in the formula), not eliminating it.                                         
  - Future: compare predicted ramp (from profiles) vs actual delivery velocity to calibrate.                                                           
                                                                                                                                                       
  ---                                                                                                                                                  
  Appendix: Integration Points Summary                                                                                                                 
  Existing File: prisma/schema.prisma                                                                                                                  
  Change Required: Add domainComplexity to Initiative, new EmployeeDomainFamiliarity model, add rampModifier/rampBreakdown to AllocationPeriod         
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: services/scenario-calculator.service.ts:416                                                                                           
  Change Required: Multiply by rampModifier in capacity loop                                                                                           
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: services/allocation.service.ts                                                                                                        
  Change Required: Call computeRampModifier() after computeAllocationPeriods()                                                                         
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: services/allocation.service.ts:1084                                                                                                   
  Change Required: Composite sort key with familiarity                                                                                                 
  Phase: 2                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: services/allocation.service.ts:1162                                                                                                   
  Change Required: Use effective hours (with ramp) for demand matching                                                                                 
  Phase: 2                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: services/baseline.service.ts:109                                                                                                      
  Change Required: Add rampModifier to allocation snapshot entries                                                                                     
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: schemas/scenarios.schema.ts                                                                                                           
  Change Required: Add ramp assumptions to Zod schema                                                                                                  
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: types/index.ts                                                                                                                        
  Change Required: Add RampBreakdown, DomainComplexity, EmployeeDomainFamiliarity interfaces                                                           
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: frontend/src/pages/ScenarioPlanner.tsx:1661                                                                                           
  Change Required: Add "Ramp Cost" summary pill                                                                                                        
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: frontend/src/pages/ScenarioPlanner.tsx (allocations table)                                                                            
  Change Required: Add "Ramp" column                                                                                                                   
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: frontend/src/hooks/useScenarios.ts                                                                                                    
  Change Required: Extend calculator result type with ramp summary                                                                                     
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: frontend/src/types/index.ts                                                                                                           
  Change Required: Add ramp-related frontend types                                                                                                     
  Phase: 1                                                                                                                                             
  ────────────────────────────────────────                                                                                                             
  Existing File: jobs/processors/                                                                                                                      
  Change Required: Add familiarity auto-population job                                                                                                 
  Phase: 2