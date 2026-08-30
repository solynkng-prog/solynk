const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
);

if (!supabaseConfigured && process.env.NODE_ENV !== 'test') {
  console.warn(
    'Supabase is not configured. Add SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.'
  );
}

const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  {
  auth: { autoRefreshToken: false, persistSession: false }
  }
);

const supabaseAuth = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
  auth: { autoRefreshToken: false, persistSession: false }
  }
);

module.exports = { supabase, supabaseAuth };
