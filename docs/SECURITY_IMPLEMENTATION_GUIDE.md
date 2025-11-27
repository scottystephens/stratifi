# 🔒 Security Implementation Guide - Quick Start

**Priority:** 🔴 CRITICAL FIXES FIRST  
**Timeline:** 2 weeks  
**Status:** Ready to implement

---

## 🚀 Week 1: Critical Security Fixes

### Day 1-2: Rate Limiting

**Install dependencies:**
```bash
npm install @upstash/ratelimit @upstash/redis
```

**Create `/lib/security/rate-limit.ts`:**
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Create rate limiters for different scenarios
export const rateLimits = {
  // Strict for authentication
  auth: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "15 m"), // 5 attempts per 15 mins
    analytics: true,
  }),
  
  // Moderate for API calls
  api: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per minute
    analytics: true,
  }),
  
  // Relaxed for reads
  read: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(300, "1 m"), // 300 requests per minute
    analytics: true,
  }),
  
  // Very strict for expensive operations
  banking: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 banking syncs per hour
    analytics: true,
  }),
};

export async function checkRateLimit(
  identifier: string,
  type: keyof typeof rateLimits = 'api'
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const result = await rateLimits[type].limit(identifier);
  
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
```

**Add Vercel environment variables:**
```env
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

**Update API routes (example):**
```typescript
// app/api/banking/[provider]/sync/route.ts
import { checkRateLimit } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check rate limit
  const { success, limit, remaining, reset } = await checkRateLimit(
    `banking:${user.id}`,
    'banking'
  );
  
  if (!success) {
    return NextResponse.json(
      { 
        error: 'Rate limit exceeded',
        limit,
        remaining,
        resetAt: new Date(reset).toISOString(),
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }
  
  // Continue with sync...
}
```

---

### Day 3: CORS & Security Headers

**Update `next.config.js`:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  async headers() {
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://stratiri.vercel.app';
    
    return [
      {
        // Apply to all API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS,PATCH' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Content-Type, Authorization, X-RateLimit-Limit, X-RateLimit-Remaining' },
          { key: 'Access-Control-Max-Age', value: '86400' }, // 24 hours
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.plaid.com https://cdn.tink.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://plaid.com https://api.tink.com wss://*.supabase.co",
              "frame-src https://cdn.plaid.com https://link.tink.com",
            ].join('; ')
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

---

### Day 4-5: Sanitize Error Messages

**Create `/lib/security/error-handler.ts`:**
```typescript
interface ErrorContext {
  endpoint: string;
  userId?: string;
  tenantId?: string;
  [key: string]: any;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public context?: ErrorContext
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(
  error: unknown,
  context: ErrorContext
): NextResponse {
  // Log full error server-side
  console.error('[API_ERROR]', {
    ...context,
    errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    message: error instanceof Error ? error.message : 'Unknown error',
    timestamp: new Date().toISOString(),
    // Don't log stack in production
    ...(process.env.NODE_ENV === 'development' && {
      stack: error instanceof Error ? error.stack : undefined,
    }),
  });
  
  // Return generic error to client
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  
  // For unexpected errors, return generic message
  return NextResponse.json(
    { error: 'An error occurred. Please try again later.' },
    { status: 500 }
  );
}

// Usage in API routes
try {
  // ... your code
  if (!account) {
    throw new ApiError(404, 'Resource not found', { endpoint: '/api/accounts' });
  }
} catch (error) {
  return handleApiError(error, {
    endpoint: '/api/accounts',
    userId: user?.id,
    tenantId,
  });
}
```

**Update all API routes:**
```typescript
// Before:
} catch (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

// After:
} catch (error) {
  return handleApiError(error, {
    endpoint: '/api/accounts/create',
    userId: user?.id,
    tenantId: body.tenantId,
  });
}
```

---

### Day 6-7: CSRF Protection

**Create `/lib/security/csrf.ts`:**
```typescript
import crypto from 'crypto';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

interface CsrfToken {
  token: string;
  expiresAt: number;
}

// Store tokens in memory (use Redis in production)
const tokenStore = new Map<string, CsrfToken>();

export function generateCsrfToken(sessionId: string): string {
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  
  tokenStore.set(sessionId, {
    token,
    expiresAt: Date.now() + CSRF_TOKEN_EXPIRY,
  });
  
  // Clean up old tokens
  cleanupExpiredTokens();
  
  return token;
}

export function validateCsrfToken(
  token: string | null,
  sessionId: string
): boolean {
  if (!token) return false;
  
  const stored = tokenStore.get(sessionId);
  if (!stored) return false;
  
  // Check expiry
  if (Date.now() > stored.expiresAt) {
    tokenStore.delete(sessionId);
    return false;
  }
  
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(stored.token)
  );
}

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [sessionId, token] of tokenStore.entries()) {
    if (now > token.expiresAt) {
      tokenStore.delete(sessionId);
    }
  }
}
```

**Add middleware for CSRF:**
```typescript
// middleware.ts - add to existing middleware
export async function middleware(request: NextRequest) {
  // ... existing auth code ...
  
  // CSRF protection for state-changing operations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const csrfToken = request.headers.get('x-csrf-token');
    const sessionId = user?.id || 'anonymous';
    
    if (!validateCsrfToken(csrfToken, sessionId)) {
      return NextResponse.json(
        { error: 'Invalid CSRF token' },
        { status: 403 }
      );
    }
  }
  
  return supabaseResponse;
}
```

**Client-side (fetch CSRF token):**
```typescript
// lib/api-client.ts
export async function apiCall(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Get CSRF token from cookie or API
  const csrfToken = getCsrfToken(); // Implement this
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken,
    },
  });
}
```

---

## 📋 Deployment Checklist

### Before Deploying
- [ ] Rate limiting implemented and tested
- [ ] CORS headers configured
- [ ] Security headers added
- [ ] Error messages sanitized
- [ ] CSRF protection enabled
- [ ] Environment variables set in Vercel
- [ ] Test all critical flows

### Environment Variables to Add
```env
# Rate Limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# CORS
NEXT_PUBLIC_APP_URL=https://stratiri.vercel.app
```

### Testing
```bash
# Test rate limiting
for i in {1..20}; do curl -X POST http://localhost:3000/api/test; done

# Test CORS
curl -H "Origin: https://evil.com" http://localhost:3000/api/accounts

# Test CSRF
curl -X POST http://localhost:3000/api/accounts -H "Content-Type: application/json"

# Test error handling
# Should return generic error, not stack trace
```

---

## 🚀 Week 2: High Priority Fixes

### Day 8-10: Input Validation with Zod

**Install Zod:**
```bash
npm install zod
```

**Create schemas (`/lib/validators/`):**
```typescript
// lib/validators/account.ts
import { z } from 'zod';

export const CreateAccountSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  accountName: z.string().min(1, 'Account name required').max(255),
  accountType: z.enum([
    'checking', 'savings', 'money_market', 'certificate_deposit',
    'credit_card', 'line_of_credit', 'loan', 'mortgage',
    'investment_brokerage', 'retirement_401k', 'retirement_ira',
    'pension', 'trust', 'escrow', 'merchant', 'payroll',
    'treasury', 'foreign_exchange', 'crypto_wallet', 'other',
  ], { errorMap: () => ({ message: 'Invalid account type' }) }),
  currency: z.string().length(3, 'Currency must be 3 letters (e.g., USD)').toUpperCase(),
  balance: z.number().optional(),
  status: z.enum(['active', 'inactive', 'closed']).default('active'),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
```

**Use in API routes:**
```typescript
import { CreateAccountSchema } from '@/lib/validators/account';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate input
    const validated = CreateAccountSchema.parse(body);
    
    // Use validated data (TypeScript knows the types!)
    const account = await createAccount(validated);
    
    return NextResponse.json({ success: true, account });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.errors,
        },
        { status: 400 }
      );
    }
    return handleApiError(error, { endpoint: '/api/accounts' });
  }
}
```

### Day 11-14: Refactor Logging

**Create structured logger (`/lib/services/logger.ts`):**
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

const SENSITIVE_FIELDS = [
  'password', 'token', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token', 'secret', 'apiKey',
  'api_key', 'clientSecret', 'client_secret',
];

function sanitize(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = { ...data };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***';
    }
  }
  return sanitized;
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(JSON.stringify({
        level: 'debug',
        message,
        ...sanitize(context),
        timestamp: new Date().toISOString(),
      }));
    }
  },
  
  info: (message: string, context?: LogContext) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      ...sanitize(context),
      timestamp: new Date().toISOString(),
    }));
  },
  
  warn: (message: string, context?: LogContext) => {
    console.warn(JSON.stringify({
      level: 'warn',
      message,
      ...sanitize(context),
      timestamp: new Date().toISOString(),
    }));
  },
  
  error: (message: string, error: Error, context?: LogContext) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      errorType: error.constructor.name,
      ...sanitize(context),
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
      }),
      timestamp: new Date().toISOString(),
    }));
  },
};
```

**Replace all console.log/error:**
```bash
# Find all console statements
grep -r "console\." app/api --include="*.ts" | wc -l

# Replace systematically:
# console.log(...) → logger.info(...)
# console.error(...) → logger.error(...)
# console.warn(...) → logger.warn(...)
```

---

## 📊 Progress Tracking

Create this file to track implementation:

```markdown
# Security Implementation Progress

## Week 1: Critical Fixes
- [ ] Day 1-2: Rate limiting (40% complete)
- [ ] Day 3: CORS & headers (0% complete)
- [ ] Day 4-5: Error sanitization (0% complete)
- [ ] Day 6-7: CSRF protection (0% complete)

## Week 2: High Priority
- [ ] Day 8-10: Input validation (0% complete)
- [ ] Day 11-14: Logging refactor (0% complete)

## Testing
- [ ] Rate limiting tests
- [ ] CORS tests
- [ ] Error handling tests
- [ ] CSRF tests
- [ ] Input validation tests

## Deployment
- [ ] Environment variables configured
- [ ] Security headers verified
- [ ] Rate limits tuned
- [ ] Monitoring enabled
```

---

## 🎯 Success Metrics

After implementation, verify:

```bash
# 1. Rate limiting works
curl -i https://stratiri.vercel.app/api/accounts
# Check for X-RateLimit-* headers

# 2. CORS configured
curl -H "Origin: https://evil.com" https://stratiri.vercel.app/api/accounts
# Should return CORS error

# 3. Security headers present
curl -I https://stratiri.vercel.app
# Check for CSP, X-Frame-Options, etc.

# 4. Errors sanitized
# Trigger error, check response has no stack trace

# 5. CSRF required
curl -X POST https://stratiri.vercel.app/api/accounts
# Should return 403 without CSRF token
```

---

**Status:** Ready to implement  
**Timeline:** 2 weeks  
**Impact:** Security score: 65 → 85


