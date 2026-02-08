/**
 * Role-to-permissions fallback map.
 *
 * When the JWT access token does not contain the namespaced permissions claim
 * (e.g. Auth0 RBAC not yet configured), permissions are derived from the
 * local User.role in the database.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    'initiative:read', 'initiative:write',
    'scenario:read', 'scenario:write',
    'employee:read', 'employee:write',
    'planning:read', 'planning:write',
    'forecast:read', 'forecast:write',
    'org:read', 'org:write',
    'approval:read', 'approval:write',
    'drift:read', 'drift:write',
    'job-profile:read', 'job-profile:write',
    'feature-flag:admin',
    'jira:admin',
    'authority:admin',
  ],
  PRODUCT_OWNER: [
    'initiative:read', 'initiative:write',
    'scenario:read', 'scenario:write',
    'planning:read', 'planning:write',
    'forecast:read', 'forecast:write',
    'drift:read', 'drift:write',
    'approval:read', 'approval:write',
    'employee:read',
    'org:read',
    'job-profile:read',
  ],
  BUSINESS_OWNER: [
    'initiative:read', 'initiative:write',
    'scenario:read', 'scenario:write',
    'planning:read', 'planning:write',
    'forecast:read',
    'employee:read',
    'org:read',
    'job-profile:read',
  ],
  RESOURCE_MANAGER: [
    'employee:read', 'employee:write',
    'org:read',
    'scenario:read',
    'initiative:read',
    'job-profile:read',
  ],
  VIEWER: [
    'initiative:read',
    'scenario:read',
    'employee:read',
    'org:read',
    'forecast:read',
    'job-profile:read',
  ],
};

export function permissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS['VIEWER'];
}

// ============================================================================
// Entitlement / Seat Licensing
// ============================================================================

/**
 * Permissions that imply a decision seat (any write or admin action).
 * A user holding ANY of these is a licensed decision-maker.
 */
export const DECISION_PERMISSIONS = [
  'initiative:write',
  'scenario:write',
  'employee:write',
  'planning:write',
  'forecast:write',
  'org:write',
  'approval:write',
  'drift:write',
  'job-profile:write',
  'feature-flag:admin',
  'jira:admin',
  'authority:admin',
] as const;

export type SeatType = 'decision' | 'observer' | 'resource';

/**
 * Derive the seat type from a user's permissions.
 * If ANY decision permission is present → decision seat (licensed).
 * Otherwise → observer seat (free).
 */
export function deriveSeatType(permissions: string[]): SeatType {
  return permissions.some((p) => (DECISION_PERMISSIONS as readonly string[]).includes(p))
    ? 'decision'
    : 'observer';
}

/**
 * Tier-to-feature mapping.
 * Each tier includes all permissions from previous tiers plus additions.
 */
export const TIER_FEATURES: Record<string, string[]> = {
  starter: [
    'initiative:read', 'initiative:write',
    'scenario:read', 'scenario:write',
    'employee:read', 'employee:write',
    'org:read',
  ],
  growth: [
    // Starter features
    'initiative:read', 'initiative:write',
    'scenario:read', 'scenario:write',
    'employee:read', 'employee:write',
    'org:read',
    // Growth additions
    'planning:read', 'planning:write',
    'forecast:read', 'forecast:write',
    'approval:read', 'approval:write',
    'drift:read', 'drift:write',
  ],
  enterprise: [
    // Growth features
    'initiative:read', 'initiative:write',
    'scenario:read', 'scenario:write',
    'employee:read', 'employee:write',
    'org:read',
    'planning:read', 'planning:write',
    'forecast:read', 'forecast:write',
    'approval:read', 'approval:write',
    'drift:read', 'drift:write',
    // Enterprise additions
    'job-profile:read', 'job-profile:write',
    'org:write',
    'feature-flag:admin',
    'jira:admin',
    'authority:admin',
  ],
};
