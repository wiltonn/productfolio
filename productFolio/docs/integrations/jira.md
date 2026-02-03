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
