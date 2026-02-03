// Jira integration types

export interface JiraConnection {
  id: string;
  userId: string;
  atlassianAccountId: string;
  accountEmail: string | null;
  displayName: string | null;
  tokenExpiresAt: string;
  scopes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  sites: JiraSite[];
}

export interface JiraSite {
  id: string;
  jiraConnectionId: string;
  cloudId: string;
  siteName: string;
  siteUrl: string;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
  projectSelections?: JiraProjectSelection[];
}

export interface JiraProjectSelection {
  id: string;
  jiraSiteId: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  isSelected: boolean;
}

// Intake types

export type IntakeItemStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';

export interface IntakeItem {
  id: string;
  sourceType: 'JIRA';
  jiraSiteId: string;
  jiraIssueId: string;
  jiraIssueKey: string;
  jiraIssueUrl: string | null;
  summary: string;
  descriptionExcerpt: string | null;
  issueTypeName: string | null;
  statusName: string | null;
  statusCategory: string | null;
  priorityName: string | null;
  labels: string[] | null;
  assigneeName: string | null;
  reporterName: string | null;
  jiraCreatedAt: string | null;
  jiraUpdatedAt: string | null;
  contentHash: string | null;
  lastSyncedAt: string;
  lastSeenAt: string;
  itemStatus: IntakeItemStatus;
  initiativeId: string | null;
  createdAt: string;
  updatedAt: string;
  jiraSite: {
    id: string;
    siteName: string;
    siteUrl: string;
  };
  initiative?: {
    id: string;
    title: string;
    status: string;
  } | null;
}

export interface IntakeStats {
  totalActive: number;
  byStatusCategory: Array<{ statusCategory: string; count: number }>;
  byPriority: Array<{ priorityName: string; count: number }>;
  linked: number;
  unlinked: number;
  recentlyUpdated: number;
}

export interface IntakeFilters {
  page?: number;
  limit?: number;
  search?: string;
  statusCategory?: string;
  priorityName?: string;
  siteId?: string;
  projectKey?: string;
  linked?: string;
  itemStatus?: string;
  sortBy?: string;
  sortOrder?: string;
}

// Sync types

export interface SyncCursor {
  id: string;
  jiraSiteId: string;
  jiraProjectSelectionId: string;
  lastSyncedAt: string;
  cursorValue: string | null;
  jiraSite: {
    id: string;
    siteName: string;
    cloudId: string;
  };
  jiraProjectSelection: {
    id: string;
    projectKey: string;
    projectName: string;
  };
}

export interface SyncRun {
  id: string;
  jiraSiteId: string;
  projectKey: string | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  startedAt: string;
  completedAt: string | null;
  issuesFound: number;
  issuesCreated: number;
  issuesUpdated: number;
  issuesSkipped: number;
  errorMessage: string | null;
  triggeredBy: string | null;
  createdAt: string;
  jiraSite: {
    siteName: string;
    siteUrl?: string;
  };
}

export interface SyncStatus {
  cursors: SyncCursor[];
  recentRuns: SyncRun[];
}
