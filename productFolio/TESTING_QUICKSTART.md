# Testing Quick Start Guide

Get started with testing ProductFolio in 5 minutes.

## Prerequisites

- Node.js 18+
- Docker (for PostgreSQL and Redis)
- Git

## 1. Initial Setup

```bash
# Clone and install
git clone <repository-url>
cd productfolio
npm install

# Start Docker services
docker-compose up -d

# Setup database
npm run db:generate
npm run db:push

# Seed test data
npm run db:seed:test --workspace=@productfolio/backend
```

## 2. Run Tests

### All Tests

```bash
npm test                    # Run all unit and integration tests
```

### Backend Tests

```bash
cd packages/backend
npm test                    # Run once
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

### Frontend Tests

```bash
cd packages/frontend
npm test                    # Run once
npm run test:watch          # Watch mode
npm run test:ui             # Vitest UI
npm run test:coverage       # With coverage
```

### E2E Tests

```bash
npm run test:e2e            # Headless
npm run test:e2e:ui         # Playwright UI
npm run test:e2e:headed     # See browser
```

## 3. Test Users

Use these credentials for E2E tests:

| Email | Password | Role |
|-------|----------|------|
| admin@productfolio.test | Admin123! | ADMIN |
| planner@productfolio.test | Planner123! | PLANNER |
| viewer@productfolio.test | Viewer123! | VIEWER |

## 4. Writing Your First Test

### Component Test

```typescript
// packages/frontend/src/components/MyComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '../tests/test-utils';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render title', () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### API Test

```typescript
// packages/backend/src/tests/my-feature.test.ts
import { describe, it, expect } from 'vitest';
import { buildTestApp } from './setup';

describe('My Feature', () => {
  it('should return data', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/my-endpoint',
    });

    expect(response.statusCode).toBe(200);
  });
});
```

### E2E Test

```typescript
// tests/e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test';

test('should work', async ({ page }) => {
  await page.goto('/my-page');
  await page.click('button:has-text("Action")');
  await expect(page.locator('text=Success')).toBeVisible();
});
```

## 5. Debugging

### Backend/Frontend

```bash
# Run single test
npm test -- MyComponent.test.tsx

# Debug with VS Code
# Add breakpoint and run "Debug Current Test"
```

### E2E

```bash
# Debug mode
npx playwright test --debug

# Generate test
npx playwright codegen http://localhost:5173
```

## 6. Check Coverage

```bash
# Generate coverage
npm run test:coverage

# View reports
open packages/backend/coverage/index.html
open packages/frontend/coverage/index.html
```

## Common Commands Cheat Sheet

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run test:e2e` | E2E tests |
| `npm run test:e2e:ui` | Playwright UI |
| `npm run db:seed:test` | Seed test data |

## Troubleshooting

### Tests failing with "Cannot connect to database"

```bash
# Check Docker is running
docker ps

# Restart services
docker-compose down
docker-compose up -d

# Check .env file
cat packages/backend/.env
```

### E2E tests timing out

```bash
# Ensure test users exist
npm run db:seed:test --workspace=@productfolio/backend

# Check servers are running
# Playwright starts them automatically
```

### "Module not found" errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. Read [TESTING.md](./TESTING.md) for comprehensive guide
2. Explore existing tests in `tests/e2e/` and `packages/*/src/tests/`
3. Review [TEST_IMPLEMENTATION_SUMMARY.md](./TEST_IMPLEMENTATION_SUMMARY.md)
4. Set up CI/CD with [.github/workflows/test.yml](./.github/workflows/test.yml)

## Getting Help

- Check [TESTING.md](./TESTING.md) for detailed documentation
- View test examples in existing test files
- [Playwright Docs](https://playwright.dev)
- [Vitest Docs](https://vitest.dev)
- [Testing Library Docs](https://testing-library.com)

## Tips

✅ **Do**:
- Write tests for new features
- Run tests before committing
- Keep tests simple and focused
- Use descriptive test names

❌ **Don't**:
- Skip writing tests
- Commit failing tests
- Test implementation details
- Use fixed timeouts (use waitFor)

---

**You're all set!** Start writing tests and maintain high code quality.
