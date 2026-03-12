import { getSupabase, getSession } from './authService'
import type { Settings, Dictionary, LearnedPatterns } from '../types'

type SyncTable = 'prattle_user_settings' | 'prattle_user_dictionary' | 'prattle_user_patterns'

// --- Push to cloud ---

async function pushData(table: SyncTable, data: any): Promise<boolean> {
  const session = await getSession()
  if (!session) return false

  const sb = getSupabase()
  const { error } = await sb
    .from(table)
    .upsert({
      user_id: session.user.id,
      data,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error(`[Sync] Failed to push to ${table}:`, error.message)
    return false
  }
  console.log(`[Sync] Pushed to ${table}`)
  return true
}

/**
 * Push settings to cloud. Strips apiKeys before uploading.
 */
export async function pushSettings(settings: Settings): Promise<boolean> {
  const { apiKeys, ...safeSettings } = settings
  return pushData('prattle_user_settings', safeSettings)
}

export async function pushDictionary(dictionary: Dictionary): Promise<boolean> {
  return pushData('prattle_user_dictionary', dictionary)
}

export async function pushPatterns(patterns: LearnedPatterns): Promise<boolean> {
  return pushData('prattle_user_patterns', patterns)
}

// --- Pull from cloud ---

interface CloudData {
  settings: Partial<Settings> | null
  dictionary: Dictionary | null
  patterns: LearnedPatterns | null
}

async function pullData<T>(table: SyncTable): Promise<T | null> {
  const session = await getSession()
  if (!session) return null

  const sb = getSupabase()
  const { data, error } = await sb
    .from(table)
    .select('data, updated_at')
    .eq('user_id', session.user.id)
    .single()

  if (error) {
    // PGRST116 = no rows found (first sync), not an error
    if (error.code !== 'PGRST116') {
      console.error(`[Sync] Failed to pull from ${table}:`, error.message)
    }
    return null
  }

  return data?.data as T ?? null
}

/**
 * Pull all data from cloud. Returns null for any type that hasn't been synced yet.
 */
export async function pullFromCloud(): Promise<CloudData> {
  const [settings, dictionary, patterns] = await Promise.all([
    pullData<Partial<Settings>>('prattle_user_settings'),
    pullData<Dictionary>('prattle_user_dictionary'),
    pullData<LearnedPatterns>('prattle_user_patterns'),
  ])

  return { settings, dictionary, patterns }
}

/**
 * Sync on login: pull cloud data and merge with local.
 * Cloud wins for settings (minus apiKeys) and dictionary.
 * For patterns, cloud wins entirely.
 * Local apiKeys are always preserved.
 */
export async function syncOnLogin(
  localSettings: Settings,
  localDictionary: Dictionary,
  localPatterns: LearnedPatterns,
): Promise<{
  settings: Settings
  dictionary: Dictionary
  patterns: LearnedPatterns
  hadCloudData: boolean
}> {
  const cloud = await pullFromCloud()

  const hadCloudData = !!(cloud.settings || cloud.dictionary || cloud.patterns)

  // Merge settings: cloud wins, but keep local apiKeys
  const mergedSettings: Settings = cloud.settings
    ? { ...localSettings, ...cloud.settings, apiKeys: localSettings.apiKeys }
    : localSettings

  // Dictionary: cloud wins if it exists
  const mergedDictionary: Dictionary = cloud.dictionary ?? localDictionary

  // Patterns: cloud wins if it exists
  const mergedPatterns: LearnedPatterns = cloud.patterns ?? localPatterns

  // If cloud had no data, push local data up (first-time sync)
  const firstSyncPushes: Promise<boolean>[] = []
  if (!cloud.settings) firstSyncPushes.push(pushSettings(mergedSettings))
  if (!cloud.dictionary) firstSyncPushes.push(pushDictionary(mergedDictionary))
  if (!cloud.patterns) firstSyncPushes.push(pushPatterns(mergedPatterns))
  if (firstSyncPushes.length > 0) {
    await Promise.all(firstSyncPushes)
  }

  return {
    settings: mergedSettings,
    dictionary: mergedDictionary,
    patterns: mergedPatterns,
    hadCloudData,
  }
}

// --- Debounced push ---

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedPush(key: string, fn: () => Promise<boolean>, delayMs = 2000) {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(() => {
    fn().catch(err => console.error(`[Sync] Debounced push failed for ${key}:`, err))
  }, delayMs)
}

/** Clear all pending debounce timers (call on logout) */
export function clearSyncTimers() {
  for (const key of Object.keys(debounceTimers)) {
    clearTimeout(debounceTimers[key])
    delete debounceTimers[key]
  }
}

export function debouncedPushSettings(settings: Settings) {
  debouncedPush('settings', () => pushSettings(settings))
}

export function debouncedPushDictionary(dictionary: Dictionary) {
  debouncedPush('dictionary', () => pushDictionary(dictionary))
}

export function debouncedPushPatterns(patterns: LearnedPatterns) {
  debouncedPush('patterns', () => pushPatterns(patterns))
}
