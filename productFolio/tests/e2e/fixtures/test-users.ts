/**
 * Test users for E2E tests
 * These should match the users created in the seed script
 */

export const TEST_USERS = {
  admin: {
    email: 'admin@example.com',
    password: 'AdminPassword123',
    role: 'ADMIN',
    name: 'Admin User',
  },
  productOwner: {
    email: 'product.owner@example.com',
    password: 'ProductOwner123',
    role: 'PRODUCT_OWNER',
    name: 'Product Owner',
  },
  businessOwner: {
    email: 'business.owner@example.com',
    password: 'BusinessOwner123',
    role: 'BUSINESS_OWNER',
    name: 'Business Owner',
  },
} as const;

export type TestUser = (typeof TEST_USERS)[keyof typeof TEST_USERS];
