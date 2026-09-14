import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const isDemoMode = !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder') || supabaseUrl.includes('your-project')

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[SmartBiz] Supabase env vars not set. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local'
  )
}

// Using an untyped client avoids complex generic inference issues before
// the real schema is connected. All query results are explicitly typed at
// the call site via interfaces in each module.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

// Helper: get current user's ID
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
