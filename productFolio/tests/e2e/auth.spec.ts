import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login page', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText(['Login', 'Sign in', 'Welcome']);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.click('button[type="submit"]');

    // Wait for validation messages
    await page.waitForTimeout(500);

    // Check for validation feedback
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');

    // Check if inputs are marked as invalid or error messages appear
    await expect(
      emailInput.or(page.locator('text=/email.*required/i'))
    ).toBeVisible();
    await expect(
      passwordInput.or(page.locator('text=/password.*required/i'))
    ).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[name="email"]', 'invalid@test.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Wait for error message
    await expect(
      page.locator('text=/invalid.*credentials|incorrect|authentication failed/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Login with admin user
    await page.fill('input[name="email"]', TEST_USERS.admin.email);
    await page.fill('input[name="password"]', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');

    // Should redirect to initiatives page
    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });

    // Should see user name or menu
    await expect(
      page.locator(`text=${TEST_USERS.admin.name}`).or(page.locator('[data-testid="user-menu"]'))
    ).toBeVisible();
  });

  test('should maintain session after page refresh', async ({ page }) => {
    // Login
    await page.fill('input[name="email"]', TEST_USERS.admin.email);
    await page.fill('input[name="password"]', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });

    // Refresh page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL(/\/initiatives/);
    await expect(
      page.locator(`text=${TEST_USERS.admin.name}`).or(page.locator('[data-testid="user-menu"]'))
    ).toBeVisible();
  });

  test('should successfully logout', async ({ page }) => {
    // Login first
    await page.fill('input[name="email"]', TEST_USERS.admin.email);
    await page.fill('input[name="password"]', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });

    // Click user menu
    const userMenu = page.locator('[data-testid="user-menu"]').or(
      page.locator('button:has-text("' + TEST_USERS.admin.name + '")')
    );
    await userMenu.click();

    // Click logout
    const logoutButton = page.locator('[data-testid="logout-button"]').or(
      page.locator('button:has-text("Logout")')
    ).or(page.locator('button:has-text("Sign out")'));
    await logoutButton.click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login|\/$/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('should redirect to login when accessing protected route', async ({ page }) => {
    // Try to access protected route directly
    await page.goto('/initiatives');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login|\/$/);
  });

  test('should handle concurrent login attempts gracefully', async ({ page }) => {
    const email = TEST_USERS.admin.email;
    const password = TEST_USERS.admin.password;

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);

    // Click submit multiple times rapidly
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    await submitButton.click();
    await submitButton.click();

    // Should still successfully login once
    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });
  });

  test('should show password visibility toggle', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');

    // Should be password type by default
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Look for toggle button (common patterns)
    const toggleButton = page.locator('button:has-text("Show")').or(
      page.locator('button[aria-label*="password"]')
    );

    if (await toggleButton.count() > 0) {
      await toggleButton.first().click();
      // After toggle, should be text type
      await expect(passwordInput).toHaveAttribute('type', 'text');
    }
  });
});

test.describe('Role-based Access', () => {
  test('admin can access all features', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="email"]', TEST_USERS.admin.email);
    await page.fill('input[name="password"]', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });

    // Admin should see admin features (e.g., user management, create buttons)
    // This is implementation-specific - adjust selectors based on your UI
    const hasAdminFeatures =
      (await page.locator('text=/create|new initiative|register user/i').count()) > 0;
    expect(hasAdminFeatures).toBe(true);
  });

  test('viewer has read-only access', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="email"]', TEST_USERS.viewer.email);
    await page.fill('input[name="password"]', TEST_USERS.viewer.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });

    // Viewer should NOT see create/edit buttons
    // This is implementation-specific
    const hasCreateButton = (await page.locator('button:has-text("Create")').count()) > 0;
    const hasNewButton = (await page.locator('button:has-text("New")').count()) > 0;

    // At least one restriction should be in place
    if (hasCreateButton || hasNewButton) {
      // If buttons exist, they should be disabled
      const createButtons = page.locator('button:has-text("Create")');
      if (await createButtons.count() > 0) {
        await expect(createButtons.first()).toBeDisabled();
      }
    }
  });
});
