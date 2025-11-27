# Tests Directory

This directory contains all tests for the Stratiri application.

## Structure

```
tests/
├── setup.ts                    # Global test setup and mocks
├── fixtures.ts                 # Test data fixtures and utilities
├── unit/                       # Unit tests
│   ├── lib/                    # Library/utility tests
│   └── components/             # Component tests
├── integration/                # Integration tests
│   ├── api/                    # API route tests
│   └── database/               # Database operation tests
└── e2e/                        # End-to-end tests (future)
```

## Running Tests

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Writing Tests

### Unit Tests
Place in `tests/unit/` directory. Test individual functions, components, or modules in isolation.

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should do something', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

### Integration Tests
Place in `tests/integration/` directory. Test multiple components working together.

```typescript
import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '../fixtures';

describe('API Route', () => {
  it('should handle request', async () => {
    const mockSupabase = createMockSupabaseClient();
    // Test API logic
  });
});
```

## Test Fixtures

Import test data from `fixtures.ts`:

```typescript
import { mockAccount, mockTenant1, createMockSupabaseClient } from '../fixtures';
```

## Coverage Goals

- **Critical security code:** 100%
- **Banking providers:** 90%
- **API routes:** 85%
- **Business logic:** 80%
- **UI components:** 60%

