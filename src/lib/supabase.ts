import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Helper genérico para llamar RPCs ──
export async function rpcCall<T = any>(
  fnName: string,
  params: Record<string, any> = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const { data, error } = await supabase.rpc(fnName, params)
  if (error) return { ok: false, error: error.message }
  // Las RPCs de Tío Bigotes devuelven {ok, ...rest}
  if (data && typeof data === 'object' && 'ok' in data) {
    return data as { ok: boolean; data?: T; error?: string }
  }
  return { ok: true, data: data as T }
}

// ── Query paginada ──
export async function fetchPaginated(
  table: string,
  options: {
    select?: string
    filters?: Record<string, any>
    orderBy?: string
    ascending?: boolean
    limit?: number
  } = {}
) {
  const { select = '*', filters = {}, orderBy = 'id', ascending = true, limit = 1000 } = options
  let query = supabase.from(table).select(select).order(orderBy, { ascending }).limit(limit)

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'boolean') {
        query = query.eq(key, value)
      } else {
        query = query.eq(key, value)
      }
    }
  })

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}
