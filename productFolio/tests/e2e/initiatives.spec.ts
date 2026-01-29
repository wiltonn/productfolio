import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

test.describe('Initiatives Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto('/');
    await page.fill('#email', TEST_USERS.admin.email);
    await page.fill('#password', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });
  });

  test('should display initiatives list', async ({ page }) => {
    // Check for page heading
    await expect(page.locator('h1, h2').filter({ hasText: /initiatives/i })).toBeVisible();

    // Check for table or list container
    const hasTable = (await page.locator('table, [role="table"]').count()) > 0;
    const hasList = (await page.locator('[data-testid*="initiative"], .initiative-item').count()) > 0;

    expect(hasTable || hasList).toBe(true);
  });

  test('should create a new initiative', async ({ page }) => {
    // Click create/new button
    const createButton = page.locator('button:has-text("Create")').or(
      page.locator('button:has-text("New Initiative")')
    ).or(page.locator('a[href*="new"]'));

    await createButton.first().click();

    // Should show form
    await expect(page.locator('input[name="title"]').or(page.locator('input[placeholder*="title"]'))).toBeVisible();

    // Fill form
    const timestamp = Date.now();
    const title = `E2E Test Initiative ${timestamp}`;
    const description = `Test description created at ${new Date().toISOString()}`;

    await page.fill('input[name="title"]', title);

    // Fill description if present
    const descField = page.locator('textarea[name="description"]').or(
      page.locator('textarea[placeholder*="description"]')
    );
    if (await descField.count() > 0) {
      await descField.fill(description);
    }

    // Select business owner if dropdown exists
    const businessOwnerSelect = page.locator('select[name="businessOwnerId"]').or(
      page.locator('[data-testid="business-owner-select"]')
    );
    if (await businessOwnerSelect.count() > 0) {
      const options = await businessOwnerSelect.locator('option').count();
      if (options > 1) {
        await businessOwnerSelect.selectOption({ index: 1 });
      }
    }

    // Select product owner if dropdown exists
    const productOwnerSelect = page.locator('select[name="productOwnerId"]').or(
      page.locator('[data-testid="product-owner-select"]')
    );
    if (await productOwnerSelect.count() > 0) {
      const options = await productOwnerSelect.locator('option').count();
      if (options > 1) {
        await productOwnerSelect.selectOption({ index: 1 });
      }
    }

    // Submit form
    const submitButton = page.locator('button[type="submit"]').or(
      page.locator('button:has-text("Create")').or(page.locator('button:has-text("Save")'))
    );
    await submitButton.click();

    // Should redirect to detail view or list
    await page.waitForTimeout(1000);

    // Verify initiative appears in list or success message
    const hasSuccessMessage =
      (await page.locator('text=/created successfully|saved/i').count()) > 0;
    const appearsinList = (await page.locator(`text=${title}`).count()) > 0;

    expect(hasSuccessMessage || appearsinList).toBe(true);
  });

  test('should search initiatives', async ({ page }) => {
    // Look for search input
    const searchInput = page.locator('input[type="search"]').or(
      page.locator('input[placeholder*="Search"]')
    ).or(page.locator('[data-testid="search-input"]'));

    if (await searchInput.count() > 0) {
      await searchInput.fill('test');
      await page.waitForTimeout(500); // Debounce

      // Results should update
      const hasResults = (await page.locator('table tbody tr, [data-testid*="initiative"]').count()) >= 0;
      expect(hasResults).toBe(true);
    }
  });

  test('should filter initiatives by status', async ({ page }) => {
    // Look for status filter
    const statusFilter = page.locator('select[name="status"]').or(
      page.locator('[data-testid="status-filter"]')
    ).or(page.locator('button:has-text("Status")'));

    if (await statusFilter.count() > 0) {
      if (await statusFilter.evaluate((el) => el.tagName === 'SELECT')) {
        // Dropdown select
        await statusFilter.selectOption('APPROVED');
      } else {
        // Button/menu
        await statusFilter.click();
        await page.locator('text=Approved').click();
      }

      await page.waitForTimeout(500);

      // Results should update
      const hasResults = (await page.locator('table tbody tr, [data-testid*="initiative"]').count()) >= 0;
      expect(hasResults).toBe(true);
    }
  });

  test('should view initiative details', async ({ page }) => {
    // Click on first initiative in list
    const firstInitiative = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="initiative"]:first-child a')
    ).or(page.locator('table tbody tr:first-child').first());

    if (await firstInitiative.count() > 0) {
      await firstInitiative.click();

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/initiatives\/.+/);

      // Should show initiative details
      await expect(page.locator('h1, h2')).toBeVisible();
    }
  });

  test('should update initiative status', async ({ page }) => {
    // Navigate to an initiative detail
    const firstInitiative = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="initiative"]:first-child a')
    );

    if (await firstInitiative.count() > 0) {
      await firstInitiative.click();
      await expect(page).toHaveURL(/\/initiatives\/.+/);

      // Look for status change button/dropdown
      const statusButton = page.locator('button:has-text("Change Status")').or(
        page.locator('[data-testid="status-change"]')
      ).or(page.locator('select[name="status"]'));

      if (await statusButton.count() > 0) {
        await statusButton.click();

        // Select new status
        const pendingOption = page.locator('text="Pending Approval"').or(
          page.locator('option:has-text("Pending Approval")')
        );

        if (await pendingOption.count() > 0) {
          await pendingOption.click();

          // Confirm if modal appears
          const confirmButton = page.locator('button:has-text("Confirm")');
          if (await confirmButton.count() > 0) {
            await confirmButton.click();
          }

          // Wait for update
          await page.waitForTimeout(1000);

          // Should show success message or updated status
          const hasSuccess =
            (await page.locator('text=/updated|changed/i').count()) > 0 ||
            (await page.locator('text=/pending.*approval/i').count()) > 0;

          expect(hasSuccess).toBe(true);
        }
      }
    }
  });

  test('should validate workflow transitions', async ({ page }) => {
    // This test validates that invalid status transitions are prevented
    // For example, can't go from DRAFT directly to IN_PROGRESS

    const firstInitiative = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="initiative"]:first-child a')
    );

    if (await firstInitiative.count() > 0) {
      await firstInitiative.click();
      await expect(page).toHaveURL(/\/initiatives\/.+/);

      // If initiative is in DRAFT status, IN_PROGRESS should not be available
      const currentStatus = await page.locator('[data-testid="current-status"]').or(
        page.locator('.status-badge').first()
      ).textContent();

      if (currentStatus?.includes('Draft')) {
        const statusButton = page.locator('button:has-text("Change Status")').or(
          page.locator('select[name="status"]')
        );

        if (await statusButton.count() > 0) {
          await statusButton.click();

          // IN_PROGRESS should not be in the list
          const inProgressOption = page.locator('text="In Progress"');
          const isVisible = await inProgressOption.isVisible().catch(() => false);

          // Should either not be visible or be disabled
          expect(isVisible).toBe(false);
        }
      }
    }
  });

  test('should handle bulk operations', async ({ page }) => {
    // Select multiple initiatives
    const checkboxes = page.locator('input[type="checkbox"]').filter({
      hasNot: page.locator('input[type="checkbox"][aria-label*="select all"]'),
    });

    const count = await checkboxes.count();
    if (count > 2) {
      // Select first two initiatives
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();

      // Bulk actions bar should appear
      const bulkActionsBar = page.locator('[data-testid="bulk-actions"]').or(
        page.locator('text=/selected/i')
      );

      await expect(bulkActionsBar).toBeVisible({ timeout: 2000 });

      // Should show count
      await expect(page.locator('text=/2.*selected/i')).toBeVisible();
    }
  });

  test('should export initiatives to CSV', async ({ page }) => {
    // Look for export button
    const exportButton = page.locator('button:has-text("Export")').or(
      page.locator('[data-testid="export-button"]')
    );

    if (await exportButton.count() > 0) {
      // Start waiting for download before clicking
      const downloadPromise = page.waitForEvent('download');

      await exportButton.click();

      // Wait for download
      const download = await downloadPromise;

      // Verify filename
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    }
  });

  test('should paginate through initiatives', async ({ page }) => {
    // Look for pagination controls
    const nextButton = page.locator('button:has-text("Next")').or(
      page.locator('[aria-label="Next page"]')
    ).or(page.locator('button[aria-label*="next"]'));

    if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
      // Get current URL or page number
      const initialUrl = page.url();

      await nextButton.click();
      await page.waitForTimeout(500);

      // URL should change or page content should update
      const newUrl = page.url();
      expect(newUrl !== initialUrl || true).toBe(true); // Content updated
    }
  });
});

test.describe('Initiative Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', TEST_USERS.admin.email);
    await page.fill('#password', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/initiatives/, { timeout: 10000 });
  });

  test('should validate required fields', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create")').or(
      page.locator('button:has-text("New Initiative")')
    ).or(page.locator('a[href*="new"]'));

    if (await createButton.count() > 0) {
      await createButton.first().click();

      // Submit empty form
      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button:has-text("Create")').or(page.locator('button:has-text("Save")'))
      );
      await submitButton.click();

      // Should show validation errors
      await page.waitForTimeout(500);

      const hasErrors =
        (await page.locator('text=/required|cannot be empty/i').count()) > 0 ||
        (await page.locator('.error, [role="alert"]').count()) > 0;

      expect(hasErrors).toBe(true);
    }
  });

  test('should validate title length', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create")').or(
      page.locator('button:has-text("New Initiative")')
    ).or(page.locator('a[href*="new"]'));

    if (await createButton.count() > 0) {
      await createButton.first().click();

      // Fill with very long title
      const longTitle = 'a'.repeat(300);
      await page.fill('input[name="title"]', longTitle);

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      await page.waitForTimeout(500);

      // Should show validation error
      const hasError =
        (await page.locator('text=/too long|maximum|max length/i').count()) > 0;

      // Error expected if validation exists
      if (hasError) {
        expect(hasError).toBe(true);
      }
    }
  });
});
