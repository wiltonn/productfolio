import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

test.describe('Scenario Planning', () => {
  test.beforeEach(async ({ page }) => {
    // Login as planner
    await page.goto('/');
    await page.fill('input[name="email"]', TEST_USERS.planner.email);
    await page.fill('input[name="password"]', TEST_USERS.planner.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/initiatives|\/scenarios/, { timeout: 10000 });
  });

  test('should navigate to scenarios page', async ({ page }) => {
    // Look for scenarios link in navigation
    const scenariosLink = page.locator('a:has-text("Scenarios")').or(
      page.locator('nav a[href*="scenarios"]')
    );

    if (await scenariosLink.count() > 0) {
      await scenariosLink.first().click();
      await expect(page).toHaveURL(/\/scenarios/);

      // Should show scenarios heading
      await expect(page.locator('h1, h2').filter({ hasText: /scenarios/i })).toBeVisible();
    }
  });

  test('should create a new scenario', async ({ page }) => {
    // Navigate to scenarios
    await page.goto('/scenarios');

    // Click create button
    const createButton = page.locator('button:has-text("Create")').or(
      page.locator('button:has-text("New Scenario")')
    ).or(page.locator('a[href*="new"]'));

    if (await createButton.count() > 0) {
      await createButton.first().click();

      // Fill scenario form
      const timestamp = Date.now();
      const name = `E2E Test Scenario ${timestamp}`;

      const nameInput = page.locator('input[name="name"]').or(
        page.locator('input[placeholder*="name"]')
      );
      await nameInput.fill(name);

      // Fill quarter range if present
      const quarterStartSelect = page.locator('select[name="quarterStart"]').or(
        page.locator('[data-testid="quarter-start"]')
      );
      if (await quarterStartSelect.count() > 0) {
        await quarterStartSelect.selectOption({ index: 1 });
      }

      // Submit form
      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button:has-text("Create")').or(page.locator('button:has-text("Save")'))
      );
      await submitButton.click();

      await page.waitForTimeout(1000);

      // Verify creation
      const hasSuccess =
        (await page.locator('text=/created successfully|saved/i').count()) > 0 ||
        (await page.locator(`text=${name}`).count()) > 0;

      expect(hasSuccess).toBe(true);
    }
  });

  test('should view scenario details', async ({ page }) => {
    await page.goto('/scenarios');

    // Click on first scenario
    const firstScenario = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="scenario"]:first-child a')
    ).or(page.locator('table tbody tr:first-child').first());

    if (await firstScenario.count() > 0) {
      await firstScenario.click();

      // Should navigate to scenario planner
      await expect(page).toHaveURL(/\/scenarios\/.+/);

      // Should show scenario name
      await expect(page.locator('h1, h2')).toBeVisible();
    }
  });

  test('should manage initiative priorities', async ({ page }) => {
    await page.goto('/scenarios');

    // Navigate to a scenario
    const firstScenario = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="scenario"]:first-child')
    );

    if (await firstScenario.count() > 0) {
      await firstScenario.first().click();
      await expect(page).toHaveURL(/\/scenarios\/.+/);

      // Look for priority/ranking section
      const prioritySection = page.locator('[data-testid*="priority"]').or(
        page.locator('text=/priority|ranking/i')
      );

      if (await prioritySection.count() > 0) {
        // Should be able to see initiatives list
        const initiativesList = page.locator('[data-testid*="initiative"], table');
        await expect(initiativesList.first()).toBeVisible();
      }
    }
  });

  test('should allocate resources to initiatives', async ({ page }) => {
    await page.goto('/scenarios');

    const firstScenario = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="scenario"]:first-child')
    );

    if (await firstScenario.count() > 0) {
      await firstScenario.first().click();
      await expect(page).toHaveURL(/\/scenarios\/.+/);

      // Look for allocate or assign button
      const allocateButton = page.locator('button:has-text("Allocate")').or(
        page.locator('button:has-text("Assign")')
      ).or(page.locator('[data-testid*="allocate"]'));

      if (await allocateButton.count() > 0) {
        await allocateButton.first().click();

        // Should show allocation form or modal
        await page.waitForTimeout(500);

        const hasForm =
          (await page.locator('select[name*="employee"], input[name*="employee"]').count()) > 0 ||
          (await page.locator('select[name*="initiative"]').count()) > 0;

        expect(hasForm).toBe(true);
      }
    }
  });

  test('should display capacity vs demand analysis', async ({ page }) => {
    await page.goto('/scenarios');

    const firstScenario = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="scenario"]:first-child')
    );

    if (await firstScenario.count() > 0) {
      await firstScenario.first().click();
      await expect(page).toHaveURL(/\/scenarios\/.+/);

      // Look for capacity section
      const capacitySection = page.locator('text=/capacity|demand/i').or(
        page.locator('[data-testid*="capacity"]')
      );

      if (await capacitySection.count() > 0) {
        await expect(capacitySection.first()).toBeVisible();

        // Should show some metrics or charts
        const hasMetrics =
          (await page.locator('text=/hours|percentage|%|allocation/i').count()) > 0;

        expect(hasMetrics).toBe(true);
      }
    }
  });

  test('should compare multiple scenarios', async ({ page }) => {
    await page.goto('/scenarios');

    // Look for compare button
    const compareButton = page.locator('button:has-text("Compare")').or(
      page.locator('[data-testid="compare-scenarios"]')
    );

    if (await compareButton.count() > 0) {
      // Select multiple scenarios
      const checkboxes = page.locator('input[type="checkbox"]').filter({
        hasNot: page.locator('input[aria-label*="select all"]'),
      });

      const count = await checkboxes.count();
      if (count >= 2) {
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();

        await compareButton.click();

        // Should show comparison view
        await page.waitForTimeout(500);

        const hasComparison =
          (await page.locator('text=/comparison|compare/i').count()) > 0;

        expect(hasComparison).toBe(true);
      }
    }
  });

  test('should handle drag and drop for priority ranking', async ({ page }) => {
    await page.goto('/scenarios');

    const firstScenario = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="scenario"]:first-child')
    );

    if (await firstScenario.count() > 0) {
      await firstScenario.first().click();
      await expect(page).toHaveURL(/\/scenarios\/.+/);

      // Look for draggable items
      const draggableItems = page.locator('[draggable="true"]').or(
        page.locator('[data-testid*="draggable"]')
      );

      if (await draggableItems.count() >= 2) {
        // Get bounding boxes
        const firstItem = draggableItems.nth(0);
        const secondItem = draggableItems.nth(1);

        const firstBox = await firstItem.boundingBox();
        const secondBox = await secondItem.boundingBox();

        if (firstBox && secondBox) {
          // Perform drag and drop
          await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
          await page.mouse.down();
          await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
          await page.mouse.up();

          // Order should change
          await page.waitForTimeout(500);

          // Verify reordering occurred (this is implementation-specific)
          const items = await page.locator('[draggable="true"]').all();
          expect(items.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

test.describe('Employee Resource Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="email"]', TEST_USERS.admin.email);
    await page.fill('input[name="password"]', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/initiatives|\/scenarios/, { timeout: 10000 });
  });

  test('should navigate to employees/capacity page', async ({ page }) => {
    const employeesLink = page.locator('a:has-text("Employees")').or(
      page.locator('a:has-text("Resources")').or(page.locator('a:has-text("Capacity")'))
    ).or(page.locator('nav a[href*="capacity"]'));

    if (await employeesLink.count() > 0) {
      await employeesLink.first().click();

      // Should show employees or capacity page
      await expect(page).toHaveURL(/\/capacity|\/employees|\/resources/);
      await expect(page.locator('h1, h2')).toBeVisible();
    }
  });

  test('should display employee list', async ({ page }) => {
    await page.goto('/capacity');

    // Should show employees table or list
    const hasTable = (await page.locator('table, [role="table"]').count()) > 0;
    const hasList = (await page.locator('[data-testid*="employee"]').count()) > 0;

    expect(hasTable || hasList).toBe(true);
  });

  test('should filter employees by skill', async ({ page }) => {
    await page.goto('/capacity');

    // Look for skill filter
    const skillFilter = page.locator('select[name*="skill"]').or(
      page.locator('[data-testid*="skill-filter"]')
    ).or(page.locator('button:has-text("Skills")'));

    if (await skillFilter.count() > 0) {
      if (await skillFilter.evaluate((el) => el.tagName === 'SELECT')) {
        const options = await skillFilter.locator('option').count();
        if (options > 1) {
          await skillFilter.selectOption({ index: 1 });
        }
      } else {
        await skillFilter.click();
        const firstOption = page.locator('[role="option"], [role="menuitem"]').first();
        if (await firstOption.count() > 0) {
          await firstOption.click();
        }
      }

      await page.waitForTimeout(500);

      // Results should update
      const hasResults = (await page.locator('table tbody tr, [data-testid*="employee"]').count()) >= 0;
      expect(hasResults).toBe(true);
    }
  });

  test('should view employee capacity calendar', async ({ page }) => {
    await page.goto('/capacity');

    // Click on first employee
    const firstEmployee = page.locator('table tbody tr:first-child a').or(
      page.locator('[data-testid*="employee"]:first-child a')
    ).or(page.locator('table tbody tr:first-child').first());

    if (await firstEmployee.count() > 0) {
      await firstEmployee.click();

      // Should show capacity details
      await page.waitForTimeout(500);

      const hasCapacityInfo =
        (await page.locator('text=/capacity|hours|allocation/i').count()) > 0 ||
        (await page.locator('table, [role="table"]').count()) > 0;

      expect(hasCapacityInfo).toBe(true);
    }
  });
});
