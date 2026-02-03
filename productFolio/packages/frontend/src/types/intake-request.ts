// Intake Request types

export type IntakeRequestStatus =
  | 'DRAFT'
  | 'TRIAGE'
  | 'ASSESSED'
  | 'APPROVED'
  | 'CONVERTED'
  | 'CLOSED';

export type InitiativeOrigin = 'INTAKE_CONVERTED' | 'DIRECT_PM' | 'LEGACY';

export interface IntakeRequest {
  id: string;
  title: string;
  description: string | null;
  status: IntakeRequestStatus;
  requestedById: string | null;
  sponsorId: string | null;
  portfolioAreaId: string | null;
  targetQuarter: string | null;
  valueScore: number | null;
  effortEstimate: string | null;
  urgency: string | null;
  customerName: string | null;
  tags: string[] | null;
  strategicThemes: string[] | null;
  sourceType: 'JIRA' | null;
  intakeItemId: string | null;
  initiativeId: string | null;
  conversionSnapshot: Record<string, unknown> | null;
  decisionNotes: string | null;
  closedReason: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
  requestedBy?: { id: string; name: string; email: string } | null;
  sponsor?: { id: string; name: string; email: string } | null;
  portfolioArea?: { id: string; name: string } | null;
  initiative?: { id: string; title: string; status: string } | null;
  intakeItem?: {
    id: string;
    jiraIssueKey: string;
    jiraIssueUrl: string | null;
    summary: string;
    statusCategory: string | null;
    priorityName: string | null;
  } | null;
}

export interface IntakeRequestFilters {
  page?: number;
  limit?: number;
  status?: IntakeRequestStatus;
  portfolioAreaId?: string;
  targetQuarter?: string;
  requestedById?: string;
  sponsorId?: string;
  sourceType?: 'JIRA';
  search?: string;
}

export interface IntakeRequestStats {
  total: number;
  byStatus: Array<{ status: IntakeRequestStatus; count: number }>;
  byUrgency: Array<{ urgency: string; count: number }>;
  converted: number;
  unconverted: number;
}

export interface PipelineStats {
  period: { id: string; label: string } | null;
  pipeline: {
    approvedUnconverted: number;
    convertedUnplanned: number;
    convertedPlanned: number;
    nonIntakePlanned: number;
    totalPlanned: number;
  };
  coverage: {
    intakeCoveragePct: number;
    intakeLeakagePct: number;
    conversionRatePct: number;
    planningCoveragePct: number;
  };
}

export interface CreateIntakeRequestInput {
  title: string;
  description?: string | null;
  requestedById?: string | null;
  sponsorId?: string | null;
  portfolioAreaId?: string | null;
  targetQuarter?: string | null;
  valueScore?: number | null;
  effortEstimate?: string | null;
  urgency?: string | null;
  customerName?: string | null;
  tags?: string[] | null;
  strategicThemes?: string[] | null;
  sourceType?: 'JIRA' | null;
  intakeItemId?: string | null;
  decisionNotes?: string | null;
}

export interface ConvertToInitiativeInput {
  title?: string;
  description?: string | null;
  businessOwnerId: string;
  productOwnerId: string;
  portfolioAreaId?: string | null;
  productLeaderId?: string | null;
  targetQuarter?: string | null;
}
