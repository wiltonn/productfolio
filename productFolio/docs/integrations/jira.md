# Jira Integration

ProductFolio integrates with Jira Cloud via OAuth 2.0 (3LO) to sync issues and projects.

## Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JIRA_CLIENT_ID` | OAuth 2.0 client ID from Atlassian Developer Console | Yes |
| `JIRA_CLIENT_SECRET` | OAuth 2.0 client secret | Yes |
| `JIRA_TOKEN_ENCRYPTION_KEY` | 64 hex characters (32 bytes) for AES-256-GCM token encryption | Yes |
| `JIRA_REDIRECT_URI` | OAuth callback URL (default: `http://localhost:3000/api/integrations/jira/callback`) | No |

All three required variables must be set together. If only some are set, the server will log a warning at startup.

## Encryption Key Generation

Generate a secure encryption key:

```bash
openssl rand -hex 32
```

This produces a 64-character hex string suitable for `JIRA_TOKEN_ENCRYPTION_KEY`.

## Atlassian Developer Console Setup

1. Go to [https://developer.atlassian.com/console/myapps/](https://developer.atlassian.com/console/myapps/)
2. Click **Create** > **OAuth 2.0 integration**
3. Under **Authorization**, add a callback URL:
   - Local development: `http://localhost:3000/api/integrations/jira/callback`
   - Production: `https://your-domain.com/api/integrations/jira/callback`
4. Under **Permissions**, configure two APIs:

   **Jira API** — click **Add**, then **Configure**:
   - `read:jira-work`
   - `read:jira-user`
   - `write:jira-work`
   - `offline_access`

   **User identity API** — click **Add**, then **Configure**:
   - `read:me`

   This scope is required for fetching the Atlassian user profile during the OAuth callback.

5. Copy the **Client ID** and **Secret** to your `.env` file

## Health Endpoint

### `GET /api/integrations/jira/health`

Admin-only endpoint that checks integration status. Never throws — always returns structured JSON.

**Response format:**

```json
{
  "ok": true,
  "configured": true,
  "connected": true,
  "sites": [
    { "name": "My Site", "url": "https://mysite.atlassian.net" }
  ]
}
```

**When not configured:**

```json
{
  "ok": false,
  "configured": false,
  "connected": false,
  "error": "Jira integration is not configured",
  "suggestion": "Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, and JIRA_TOKEN_ENCRYPTION_KEY environment variables"
}
```

**When configured but not connected:**

```json
{
  "ok": false,
  "configured": true,
  "connected": false,
  "error": "No active Jira connections",
  "suggestion": "Use the Connect Jira Account button in Settings to link your Atlassian account"
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integrations/jira/health` | Integration health check |
| `GET` | `/api/integrations/jira/connect` | Get Atlassian OAuth authorization URL |
| `GET` | `/api/integrations/jira/callback` | OAuth callback (handles code exchange) |
| `GET` | `/api/integrations/jira/connections` | List all Jira connections |
| `DELETE` | `/api/integrations/jira/connections/:id` | Delete a connection |
| `GET` | `/api/integrations/jira/connections/:id/sites` | List sites for a connection |
| `PUT` | `/api/integrations/jira/connections/:id/sites` | Select sites for sync |
| `GET` | `/api/integrations/jira/sites/:id/projects` | List projects on a site |
| `PUT` | `/api/integrations/jira/sites/:id/projects` | Select projects for sync |
| `POST` | `/api/integrations/jira/sync` | Trigger manual sync |
| `GET` | `/api/integrations/jira/sync/status` | Get sync status |
| `GET` | `/api/integrations/jira/sync/runs` | Get sync run history |

All endpoints require authentication. Most require `ADMIN` role.

## Syncing Jira Issues to ProductFolio

Once the OAuth connection is established, follow these steps to start pulling Jira issues into the ProductFolio intake pipeline.

### Step 1: Connect Your Atlassian Account

1. Log in to ProductFolio as an **Admin**
2. Navigate to **Admin > Jira Settings** (route: `/admin/jira-settings`)
3. Click **Connect Jira** in the top right
4. You'll be redirected to Atlassian — authorize ProductFolio to access your account
5. After authorization, you'll be redirected back and see your connection listed as **Active**

### Step 2: Select Sites

A single Atlassian account can have access to multiple Jira Cloud sites. You need to select which sites to sync from.

1. On the **Jira Settings** page, click your connection to expand it
2. In the **Sites** section, check the boxes next to each Jira Cloud site you want to sync
3. Each site corresponds to a `*.atlassian.net` instance

### Step 3: Select Projects

For each selected site, choose which Jira projects to pull issues from.

1. Next to a selected site, click **Configure Projects**
2. In the **Projects** section, check the boxes next to the projects you want
3. Only issues from selected projects will be synced into the intake pipeline

### Step 4: Run a Sync

There are two ways issues get synced:

**Manual sync:**
- Click the **Sync Now** button on the Jira Settings page
- This enqueues a background job that pulls all issues from your selected projects

**Automatic sync (scheduled):**
- The BullMQ worker runs periodic syncs via the `jira-sync` queue
- Start the worker with `npm run dev:worker` in a separate terminal

### What Gets Synced

Each Jira issue becomes an **Intake Item** in ProductFolio. The following fields are mapped:

| Jira Field | Intake Item Field |
|------------|-------------------|
| Summary | `summary` |
| Description | `descriptionExcerpt` (first 500 chars, ADF converted to plain text) |
| Issue Type | `issueTypeName` |
| Status | `statusName`, `statusCategory` |
| Priority | `priorityName` |
| Labels | `labels` |
| Assignee | `assigneeName` |
| Reporter | `reporterName` |
| Issue Key | `jiraIssueKey` (e.g., `PROJ-123`) |
| Issue URL | `jiraIssueUrl` (direct link back to Jira) |
| Created / Updated | `jiraCreatedAt`, `jiraUpdatedAt` |

### How Incremental Sync Works

- **First sync**: Pulls issues updated in the last 180 days (backfill)
- **Subsequent syncs**: Uses a cursor to only fetch issues updated since the last sync
- **Change detection**: Each issue is hashed — if no fields changed, it's skipped (no unnecessary writes)
- **Sync statuses**: `RUNNING`, `COMPLETED`, `PARTIAL` (some errors), `FAILED`

### Monitoring Syncs

The **Jira Settings** page shows two monitoring sections:

- **Sync Status**: Per-project cursor showing the last synced timestamp
- **Sync History**: Paginated table of all sync runs with counts for issues found, created, updated, and skipped

You can also check sync status via the API:

```bash
# Sync status (cursors + recent runs)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/integrations/jira/sync/status

# Sync run history
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/integrations/jira/sync/runs?page=1&limit=10

# Trigger a manual sync
curl -X POST -H "Authorization: Bearer <token>" http://localhost:3000/api/integrations/jira/sync

# Full resync (resets cursors, re-fetches everything)
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"fullResync": true}' \
  http://localhost:3000/api/integrations/jira/sync
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| No issues syncing | Verify the site and project are both checked/selected |
| Sync shows 0 found | Check that the project has issues updated in the last 180 days |
| `FAILED` sync runs | Check the error message in Sync History; common causes are expired tokens (reconnect) or permission issues |
| Stale data | Click **Sync Now** or trigger a full resync with `fullResync: true` |
| Token errors | Disconnect and reconnect your Atlassian account |
