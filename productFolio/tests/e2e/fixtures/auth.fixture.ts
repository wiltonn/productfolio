import { test as base, expect } from '@playwright/test';
import { TEST_USERS, type TestUser } from './test-users';

/**
 * Extended test fixture with authentication helpers
 */
type AuthFixtures = {
  authenticatedPage: {
    goto: (url: string) => Promise<void>;
    loginAs: (user: TestUser) => Promise<void>;
    logout: () => Promise<void>;
  };
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const loginAs = async (user: TestUser) => {
      // Navigate to login page
      await page.goto('/');

      // Fill login form
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for navigation to complete
      await page.waitForURL('**/initiatives', { timeout: 5000 });
    };

    const logout = async () => {
      // Click user menu
      await page.click('[data-testid="user-menu"]');

      // Click logout
      await page.click('[data-testid="logout-button"]');

      // Wait for redirect to login
      await page.waitForURL('**/login', { timeout: 5000 });
    };

    const gotoAuthenticated = async (url: string) => {
      await page.goto(url);
    };

    await use({
      goto: gotoAuthenticated,
      loginAs,
      logout,
    });
  },
});

export { expect };
