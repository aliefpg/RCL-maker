import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let client;

/** Server-only Supabase client. Never expose the service-role key to the browser. */
export function getSupabase() {
  if (!client) {
    const url = requiredEnv('SUPABASE_URL');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!key) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
    }

    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
