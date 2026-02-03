// Atlassian OAuth token response
export interface AtlassianTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope: string;
  token_type: string;
}

// Atlassian accessible resources (sites)
export interface AtlassianAccessibleResource {
  id: string; // cloudId
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
}

// Atlassian user profile from /me endpoint
export interface AtlassianUserProfile {
  account_id: string;
  email?: string;
  name?: string;
}

// Jira REST API types

export interface JiraSearchResponse {
  expand?: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
}

export interface JiraIssueFields {
  summary: string;
  description?: JiraAdfDocument | string | null;
  issuetype?: {
    id: string;
    name: string;
    subtask?: boolean;
  };
  status?: {
    id: string;
    name: string;
    statusCategory?: {
      id: number;
      key: string;
      name: string;
    };
  };
  priority?: {
    id: string;
    name: string;
  };
  labels?: string[];
  assignee?: JiraUser | null;
  reporter?: JiraUser | null;
  created?: string;
  updated?: string;
  project?: {
    id: string;
    key: string;
    name: string;
  };
  parent?: {
    id: string;
    key: string;
    fields?: {
      summary: string;
    };
  };
}

export interface JiraUser {
  accountId: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
}

// Atlassian Document Format (ADF) - simplified
export interface JiraAdfDocument {
  type: 'doc';
  version: 1;
  content?: JiraAdfNode[];
}

export interface JiraAdfNode {
  type: string;
  content?: JiraAdfNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// Jira project listing
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraProjectsResponse {
  self?: string;
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
  values: JiraProject[];
}
