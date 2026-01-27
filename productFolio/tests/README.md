# E2E Tests

End-to-end tests for ProductFolio using Playwright.

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Seed test data
npm run db:seed:test --workspace=@productfolio/backend

# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific test
npx playwright test auth.spec.ts
```

## Test Structure

```
tests/e2e/
├── fixtures/
│   ├── test-users.ts       # Test user credentials
│   └── auth.fixture.ts     # Authentication helpers
├── auth.spec.ts            # Authentication flows
├── initiatives.spec.ts     # Initiative management
└── scenarios.spec.ts       # Scenario planning & resources
```

## Test Users

The following test users are created by the test seed script:

| Email | Password | Role | Access |
|-------|----------|------|--------|
| admin@productfolio.test | Admin123! | ADMIN | Full access |
| planner@productfolio.test | Planner123! | PLANNER | Initiatives & scenarios |
| viewer@productfolio.test | Viewer123! | VIEWER | Read-only |

## Test Coverage

### Authentication (`auth.spec.ts`)
- Login/logout flows
- Form validation
- Session persistence
- Role-based access
- Error handling

### Initiatives (`initiatives.spec.ts`)
- List, create, update, delete
- Search and filtering
- Status transitions
- Bulk operations
- CSV export
- Form validation

### Scenarios & Resources (`scenarios.spec.ts`)
- Scenario management
- Resource allocation
- Priority ranking (drag & drop)
- Capacity analysis
- Employee management

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/');
    await page.fill('input[name="email"]', TEST_USERS.admin.email);
    await page.fill('input[name="password"]', TEST_USERS.admin.password);
    await page.click('button[type="submit"]');
  });

  test('should do something', async ({ page }) => {
    // Arrange
    await page.goto('/some-page');

    // Act
    await page.click('button:has-text("Action")');

    // Assert
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

### Using Authentication Fixture

```typescript
import { test, expect } from './fixtures/auth.fixture';

test('with auth helper', async ({ authenticatedPage, page }) => {
  await authenticatedPage.loginAs(TEST_USERS.admin);
  await authenticatedPage.goto('/initiatives');

  // Test actions...

  await authenticatedPage.logout();
});
```

## Debugging

### Visual Debugging

```bash
# Run with headed browser
npm run test:e2e:headed

# Run with Playwright Inspector
npx playwright test --debug

# Run specific test in debug mode
npx playwright test auth.spec.ts --debug
```

### Screenshots and Videos

Failed tests automatically capture:
- Screenshots
- Videos (on failure)
- Traces (on retry)

View reports:
```bash
npx playwright show-report
```

### Generate Tests

Use Playwright's code generator:
```bash
npx playwright codegen http://localhost:5173
```

## Configuration

Configuration is in `/playwright.config.ts`:

- **Browsers**: Currently chromium (add firefox/webkit as needed)
- **Base URL**: http://localhost:5173
- **Timeouts**: Default 30s, configurable per test
- **Retries**: 2 retries on CI, 0 locally
- **Workers**: Parallel execution (1 worker on CI)

## Best Practices

1. **Use test IDs**: Add `data-testid` for reliable selectors
2. **Wait properly**: Use `expect` and `waitFor` instead of `waitForTimeout`
3. **Clean up**: Tests should be independent, clean up state if needed
4. **Test real flows**: Test complete user journeys, not isolated actions
5. **Handle async**: Always await async operations
6. **Use locators**: Prefer semantic selectors (roles, labels)

## Common Issues

### Tests Timing Out

1. Check servers are running (playwright starts them automatically)
2. Increase timeout: `test.setTimeout(60000)`
3. Check for missing awaits

### Authentication Failing

1. Ensure test users are seeded: `npm run db:seed:test --workspace=@productfolio/backend`
2. Check credentials in `fixtures/test-users.ts`
3. Verify backend is running on correct port

### Element Not Found

1. Use `screen.debug()` equivalent: `await page.screenshot({ path: 'debug.png' })`
2. Check if element is inside iframe or shadow DOM
3. Wait for element: `await page.waitForSelector('selector')`

## CI/CD Integration

For CI environments, tests run headlessly with video capture on failure.

Example GitHub Actions:
```yaml
- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
```

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Selector Best Practices](https://playwright.dev/docs/selectors)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Main Testing Guide](../TESTING.md)
