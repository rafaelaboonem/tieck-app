import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase Admin client.
 * Never import this in the frontend.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Para manter compatibilidade com código existente que espera supabaseAdmin
export const supabaseAdmin = createServerSupabaseClient()!;
