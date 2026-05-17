import { createClient } from '@supabase/supabase-js'

// Las variables vienen de .env.local en local
// y de Vercel → Settings → Environment Variables en producción.
// NUNCA están hardcodeadas en el código.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)