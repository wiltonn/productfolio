import type { JiraSearchResponse, JiraProjectsResponse } from '../types/jira.js';
import { getValidAccessToken } from './jira-auth.service.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface JiraApiOptions {
  connectionId: string;
  cloudId: string;
}

/**
 * Make an authenticated request to the Jira REST API with retry and 429 handling.
 */
async function jiraFetch<T>(
  options: JiraApiOptions,
  path: string,
  init?: RequestInit,
  retryCount = 0
): Promise<T> {
  const { connectionId, cloudId } = options;
  const { accessToken } = await getValidAccessToken(connectionId);
  const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  // Handle 429 Too Many Requests
  if (response.status === 429) {
    if (retryCount >= MAX_RETRIES) {
      throw new Error(`Jira API rate limited after ${MAX_RETRIES} retries`);
    }

    const retryAfter = response.headers.get('Retry-After');
    const delayMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : BASE_DELAY_MS * Math.pow(2, retryCount);

    console.log(`[jira-api] Rate limited, retrying in ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
    await sleep(delayMs);
    return jiraFetch<T>(options, path, init, retryCount + 1);
  }

  // Handle 401 Unauthorized - token might have expired during processing
  if (response.status === 401 && retryCount === 0) {
    console.log('[jira-api] Got 401, refreshing token and retrying once');
    return jiraFetch<T>(options, path, init, retryCount + 1);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Jira API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search issues using JQL.
 */
export async function searchIssues(
  options: JiraApiOptions,
  jql: string,
  startAt = 0,
  maxResults = 50,
  fields?: string[]
): Promise<JiraSearchResponse> {
  const defaultFields = [
    'summary',
    'description',
    'issuetype',
    'status',
    'priority',
    'labels',
    'assignee',
    'reporter',
    'created',
    'updated',
    'project',
    'parent',
  ];

  return jiraFetch<JiraSearchResponse>(options, 'search', {
    method: 'POST',
    body: JSON.stringify({
      jql,
      startAt,
      maxResults,
      fields: fields || defaultFields,
    }),
  });
}

/**
 * List projects accessible on a Jira site.
 */
export async function listProjects(
  options: JiraApiOptions,
  startAt = 0,
  maxResults = 50
): Promise<JiraProjectsResponse> {
  const params = new URLSearchParams({
    startAt: startAt.toString(),
    maxResults: maxResults.toString(),
    orderBy: 'name',
  });

  return jiraFetch<JiraProjectsResponse>(
    options,
    `project/search?${params.toString()}`
  );
}

/**
 * Get all projects (paginated).
 */
export async function listAllProjects(options: JiraApiOptions): Promise<JiraProjectsResponse['values']> {
  const allProjects: JiraProjectsResponse['values'] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const response = await listProjects(options, startAt, maxResults);
    allProjects.push(...response.values);

    if (response.isLast || allProjects.length >= response.total) {
      break;
    }

    startAt += maxResults;
  }

  return allProjects;
}
