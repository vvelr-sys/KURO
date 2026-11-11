import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in Client Components.
 * Automatically handles auth state synchronization in browser sessions.
 * 
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing.');
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}

