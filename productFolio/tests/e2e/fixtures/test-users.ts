/**
 * Test users for E2E tests
 * These should match the users created in the seed script
 */

export const TEST_USERS = {
  admin: {
    email: 'admin@productfolio.test',
    password: 'Admin123!',
    role: 'ADMIN',
    name: 'Test Admin',
  },
  planner: {
    email: 'planner@productfolio.test',
    password: 'Planner123!',
    role: 'PLANNER',
    name: 'Test Planner',
  },
  viewer: {
    email: 'viewer@productfolio.test',
    password: 'Viewer123!',
    role: 'VIEWER',
    name: 'Test Viewer',
  },
} as const;

export type TestUser = (typeof TEST_USERS)[keyof typeof TEST_USERS];
