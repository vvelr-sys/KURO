import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates an administrative Supabase client using the Service Role Key.
 * Bypasses Row Level Security (RLS) for server-side maintenance tasks.
 * NEVER expose this client or SUPABASE_SERVICE_ROLE_KEY to the browser!
 * 
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!serviceRoleKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not defined. Admin actions will fall back to anon client.');
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return createSupabaseClient(supabaseUrl, anonKey);
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

