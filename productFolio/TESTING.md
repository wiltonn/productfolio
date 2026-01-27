# Testing Guide

Comprehensive testing suite for ProductFolio, covering E2E tests, API integration tests, and component tests.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [E2E Tests (Playwright)](#e2e-tests-playwright)
- [API Integration Tests](#api-integration-tests)
- [Component Tests](#component-tests)
- [Test Data and Fixtures](#test-data-and-fixtures)
- [Best Practices](#best-practices)
- [Continuous Integration](#continuous-integration)

## Overview

The testing suite is organized into three layers:

1. **E2E Tests** - Full application flow testing using Playwright
2. **API Integration Tests** - Backend API endpoint testing with real database
3. **Component Tests** - Frontend component unit and integration tests

### Test Coverage Goals

- **E2E Tests**: Critical user flows (authentication, initiative management, scenario planning)
- **API Tests**: All endpoints with validation, authorization, and error handling
- **Component Tests**: Complex UI components with user interactions

## Test Structure

```
productfolio/
├── tests/
│   └── e2e/                    # Playwright E2E tests
│       ├── fixtures/           # Test fixtures and helpers
│       ├── auth.spec.ts        # Authentication flows
│       ├── initiatives.spec.ts # Initiative management
│       └── scenarios.spec.ts   # Scenario planning
│
├── packages/
│   ├── backend/
│   │   └── src/
│   │       └── tests/
│   │           ├── setup.ts                 # Test utilities
│   │           ├── api-integration.test.ts  # Full API integration
│   │           ├── initiatives.test.ts      # Initiative service tests
│   │           ├── resources.test.ts        # Resource service tests
│   │           └── scenarios.test.ts        # Scenario service tests
│   │
│   └── frontend/
│       └── src/
│           ├── tests/
│           │   ├── setup.ts        # Test setup and globals
│           │   └── test-utils.tsx  # Custom render utilities
│           │
│           ├── components/ui/
│           │   ├── StatusBadge.test.tsx
│           │   ├── SearchInput.test.tsx
│           │   ├── Select.test.tsx
│           │   ├── MultiSelect.test.tsx
│           │   └── BulkActionsBar.test.tsx
│           │
│           └── hooks/
│               └── useAuth.test.ts
│
└── playwright.config.ts        # Playwright configuration
```

## Running Tests

### Run All Tests

```bash
npm test                 # Run all unit and integration tests
npm run test:e2e         # Run E2E tests
npm run test:coverage    # Run with coverage report
```

### Backend Tests

```bash
cd packages/backend
npm test                 # Run all backend tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

### Frontend Tests

```bash
cd packages/frontend
npm test                 # Run all frontend tests
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI
npm run test:coverage    # With coverage
```

### E2E Tests

```bash
npm run test:e2e         # Headless mode
npm run test:e2e:headed  # Headed browser mode
npm run test:e2e:ui      # Playwright UI mode
```

### Run Specific Tests

```bash
# Backend
npm test -- initiatives.test.ts
npm test -- api-integration.test.ts

# Frontend
npm test -- StatusBadge.test.tsx
npm test -- useAuth.test.ts

# E2E
npx playwright test auth.spec.ts
npx playwright test --grep "should create a new initiative"
```

## E2E Tests (Playwright)

### Setup

E2E tests use Playwright to test the full application stack. The tests automatically start both backend and frontend servers before running.

### Test Users

Test users are defined in `tests/e2e/fixtures/test-users.ts`:

- **Admin**: Full access to all features
- **Planner**: Can manage initiatives and scenarios
- **Viewer**: Read-only access

These users should be created by your database seed script.

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

test('should create initiative', async ({ page }) => {
  // Login
  await page.goto('/');
  await page.fill('input[name="email"]', TEST_USERS.admin.email);
  await page.fill('input[name="password"]', TEST_USERS.admin.password);
  await page.click('button[type="submit"]');

  // Navigate and interact
  await page.click('button:has-text("Create")');
  await page.fill('input[name="title"]', 'New Initiative');
  await page.click('button[type="submit"]');

  // Assertions
  await expect(page.locator('text=New Initiative')).toBeVisible();
});
```

### E2E Test Coverage

#### Authentication (`auth.spec.ts`)
- ✅ Login with valid credentials
- ✅ Login validation errors
- ✅ Invalid credentials handling
- ✅ Session persistence
- ✅ Logout functionality
- ✅ Protected route access
- ✅ Role-based access control

#### Initiatives (`initiatives.spec.ts`)
- ✅ List initiatives with pagination
- ✅ Create new initiative
- ✅ Search and filter initiatives
- ✅ View initiative details
- ✅ Update initiative status
- ✅ Status workflow validation
- ✅ Bulk operations
- ✅ CSV export
- ✅ Form validation

#### Scenarios (`scenarios.spec.ts`)
- ✅ Create and view scenarios
- ✅ Manage initiative priorities
- ✅ Resource allocation
- ✅ Capacity vs demand analysis
- ✅ Scenario comparison
- ✅ Drag and drop priority ranking

#### Resources (`scenarios.spec.ts`)
- ✅ Employee list and filtering
- ✅ Capacity calendar view
- ✅ Skill-based filtering

### Visual Testing

Playwright can capture screenshots for visual regression testing:

```typescript
test('should match screenshot', async ({ page }) => {
  await page.goto('/initiatives');
  await expect(page).toHaveScreenshot('initiatives-list.png');
});
```

## API Integration Tests

### Setup

API tests use Vitest with Fastify's inject method to test the full request/response cycle without starting an HTTP server.

### Test Database

Tests use the same database as development. Clean up is handled in `afterAll` hooks.

### Writing API Tests

```typescript
describe('Initiatives API', () => {
  it('should create initiative', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/initiatives',
      cookies: { access_token: adminToken },
      payload: {
        title: 'Test Initiative',
        businessOwnerId: testUserId,
        productOwnerId: testUserId,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Test Initiative');
  });
});
```

### API Test Coverage

#### Authentication
- ✅ Login with valid/invalid credentials
- ✅ Email format validation
- ✅ Current user retrieval
- ✅ Token validation

#### Initiatives
- ✅ CRUD operations
- ✅ Pagination and filtering
- ✅ Search functionality
- ✅ Status transitions
- ✅ Workflow validation
- ✅ Bulk operations
- ✅ CSV import/export

#### Scoping
- ✅ Scope items CRUD
- ✅ Estimate validation (P90 >= P50)
- ✅ Skill demand management
- ✅ Approval workflow

#### Resources
- ✅ Employee CRUD
- ✅ Skills management
- ✅ Capacity calendars

#### Scenarios
- ✅ Scenario CRUD
- ✅ Allocations management
- ✅ Percentage validation
- ✅ Capacity calculations

#### Authorization
- ✅ Role-based access control
- ✅ VIEWER read-only restrictions
- ✅ PLANNER scenario access
- ✅ ADMIN full access

#### Error Handling
- ✅ Malformed JSON
- ✅ Invalid UUIDs
- ✅ Concurrent updates
- ✅ Validation errors

## Component Tests

### Setup

Component tests use Vitest + React Testing Library with a custom render function that provides all necessary providers.

### Writing Component Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '../../tests/test-utils';
import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
  it('should call onChange when typing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<SearchInput value="" onChange={handleChange} />);

    await user.type(screen.getByRole('searchbox'), 'test');

    expect(handleChange).toHaveBeenCalled();
  });
});
```

### Component Test Coverage

#### UI Components
- ✅ **StatusBadge**: All status variants, styling
- ✅ **SearchInput**: User input, clear button, debouncing
- ✅ **Select**: Options rendering, selection changes, validation
- ✅ **MultiSelect**: Multi-selection, tag display, removal
- ✅ **BulkActionsBar**: Visibility, action triggers, loading states

#### Hooks
- ✅ **useAuth**: Login, logout, current user, error handling
- ✅ State management integration
- ✅ Query cache updates

### Testing Utilities

Custom utilities in `test-utils.tsx`:

```typescript
import { renderWithProviders, createMockInitiative } from './tests/test-utils';

// Render with providers
const { getByText } = renderWithProviders(<MyComponent />);

// Mock data generators
const initiative = createMockInitiative({ title: 'Custom Title' });
const employee = createMockEmployee({ skills: { frontend: 5 } });
```

## Test Data and Fixtures

### Backend Test Data

Located in `packages/backend/src/tests/setup.ts`:

```typescript
import { testUuid, mockData } from './tests/setup';

// Generate consistent test UUIDs
const id = testUuid('1'); // "00000000-0000-4000-8000-000000000001"

// Mock data generators
const initiative = mockData.initiative({ title: 'Custom' });
const employee = mockData.employee({ skills: { frontend: 3 } });
```

### E2E Test Fixtures

Located in `tests/e2e/fixtures/`:

- **test-users.ts**: Predefined test user accounts
- **auth.fixture.ts**: Authentication helpers for tests

### Seeding Test Data

For E2E and integration tests, ensure your database is seeded:

```bash
npm run db:seed
```

The seed script should create:
- Test users (admin, planner, viewer)
- Sample initiatives in various statuses
- Employees with different skills
- Sample scenarios with allocations

## Best Practices

### General

1. **Test Isolation**: Each test should be independent and not rely on others
2. **Cleanup**: Always clean up test data in `afterEach` or `afterAll` hooks
3. **Descriptive Names**: Use clear, descriptive test names that explain what is being tested
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Mock External Dependencies**: Mock APIs, timers, and external services

### E2E Tests

1. **Use Test IDs**: Add `data-testid` attributes for reliable element selection
2. **Wait for Actions**: Use `waitFor` and `expect` instead of fixed timeouts
3. **Test User Flows**: Test complete workflows, not just isolated actions
4. **Minimize Test Data**: Create only the data needed for each test
5. **Handle Async Operations**: Use proper waits for network requests and UI updates

### API Tests

1. **Test Edge Cases**: Invalid inputs, boundary conditions, error scenarios
2. **Verify Status Codes**: Always check HTTP status codes
3. **Validate Response Schema**: Ensure responses match expected structure
4. **Test Authorization**: Verify role-based access controls
5. **Clean Up**: Delete test data after each test

### Component Tests

1. **Test User Interactions**: Focus on how users interact with components
2. **Avoid Implementation Details**: Test behavior, not internal implementation
3. **Mock Network Requests**: Use MSW or mock API clients
4. **Test Accessibility**: Include accessibility checks
5. **Test Error States**: Verify error handling and loading states

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:coverage

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Commands Reference

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:unit` | Unit and integration tests only |
| `npm run test:e2e` | E2E tests only |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:watch` | Watch mode for development |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:e2e:headed` | E2E tests with visible browser |
| `npx playwright codegen` | Generate E2E tests interactively |

## Debugging Tests

### Backend/Frontend Tests

```bash
# Run single test file
npm test -- StatusBadge.test.tsx

# Run with debugger
node --inspect-brk node_modules/.bin/vitest run StatusBadge.test.tsx

# Watch mode for development
npm run test:watch
```

### E2E Tests

```bash
# Run with UI
npm run test:e2e:ui

# Debug mode
npx playwright test --debug

# Run specific test
npx playwright test auth.spec.ts --headed

# Generate test
npx playwright codegen http://localhost:5173
```

### Vitest UI

For a visual test runner:

```bash
npm run test:ui
```

Opens a browser-based UI showing all tests, coverage, and results.

## Coverage Reports

After running tests with coverage, reports are generated in:

- Backend: `packages/backend/coverage/`
- Frontend: `packages/frontend/coverage/`
- E2E: `playwright-report/`

View HTML reports:

```bash
# Backend
open packages/backend/coverage/index.html

# Frontend
open packages/frontend/coverage/index.html

# E2E report
npx playwright show-report
```

## Troubleshooting

### E2E Tests Timing Out

- Increase timeout in `playwright.config.ts`
- Check that dev servers are running
- Verify database is seeded with test users

### API Tests Failing

- Check database connection
- Verify test data cleanup in `afterAll`
- Ensure proper async/await usage

### Component Tests Not Finding Elements

- Use `screen.debug()` to print DOM
- Check that providers are properly wrapped
- Verify async operations with `waitFor`

### Port Already in Use

```bash
# Kill process on port 3000 (backend)
lsof -ti:3000 | xargs kill -9

# Kill process on port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Vitest Documentation](https://vitest.dev)
- [Testing Library Documentation](https://testing-library.com)
- [Fastify Testing Guide](https://fastify.dev/docs/latest/Guides/Testing)

---

For questions or issues with tests, please refer to the project documentation or open an issue.
