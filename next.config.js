/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  async headers() {
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://stratiri.vercel.app';
    
    return [
      {
        // Apply security headers to all API routes
        source: '/api/:path*',
        headers: [
          // CORS Configuration
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS,PATCH' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Content-Type, Authorization, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset' },
          { key: 'Access-Control-Max-Age', value: '86400' }, // 24 hours
          
          // Security Headers
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          // HSTS - Force HTTPS
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.plaid.com https://cdn.tink.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://plaid.com https://api.tink.com https://cdn.tink.com wss://*.supabase.co",
              "frame-src 'self' https://cdn.plaid.com https://link.tink.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; ')
          },
          
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          
          // XSS Protection
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          
          // Referrer Policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          
          // Permissions Policy (formerly Feature Policy)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
