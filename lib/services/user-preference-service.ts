import { createClient } from '@/lib/supabase-server'

export type CurrencyPair = { from: string; to: string }

export interface RatesPreferences {
  watchlist: CurrencyPair[]
  baseCurrency: string
  timeRange: '7D' | '30D' | '90D' | 'custom'
  layout?: 'grid' | 'list'
}

const DEFAULT_PREFERENCES: RatesPreferences = {
  watchlist: [
    { from: 'EUR', to: 'USD' },
    { from: 'GBP', to: 'USD' },
    { from: 'USD', to: 'JPY' }
  ],
  baseCurrency: 'USD',
  timeRange: '30D',
  layout: 'grid'
}

const normalizePreferences = (input?: Partial<RatesPreferences>): RatesPreferences => {
  if (!input) return DEFAULT_PREFERENCES
  return {
    ...DEFAULT_PREFERENCES,
    ...input,
    watchlist: input.watchlist ?? DEFAULT_PREFERENCES.watchlist,
    layout: input.layout ?? DEFAULT_PREFERENCES.layout
  }
}

export async function getRatesPreferences(userId: string): Promise<RatesPreferences> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('[Preferences] fetch error', error)
    return DEFAULT_PREFERENCES
  }

  return normalizePreferences(data?.preferences)
}

export async function updateRatesPreferences(
  userId: string,
  updates: Partial<RatesPreferences>
): Promise<RatesPreferences> {
  const supabase = await createClient()
  const existing = await getRatesPreferences(userId)
  const merged = {
    ...existing,
    ...updates,
    watchlist: updates.watchlist ?? existing.watchlist,
    layout: updates.layout ?? existing.layout
  }

  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: userId,
        preferences: merged
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('[Preferences] update error', error)
    throw new Error('Unable to save preferences')
  }

  return merged
}

