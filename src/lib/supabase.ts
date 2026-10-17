import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aghewuqtqfvletyeocks.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurationError =
  SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'your-supabase-anon-key'
    ? null
    : 'Ajoutez votre clé anon Supabase à VITE_SUPABASE_ANON_KEY dans .env.local.';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'missing-supabase-anon-key'
);

export const supabaseAuth = supabase;
