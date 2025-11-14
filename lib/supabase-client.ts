import { createBrowserClient } from '@supabase/ssr'

// Create a Supabase client for client-side use with SSR support
// This client stores sessions in cookies (not localStorage) so server can read them
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

