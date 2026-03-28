import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// User data directory for settings, dictionary, learned patterns
export const userDataPath = path.join(app.getPath('userData'), 'prattle-data')
const legacyDataPath = path.join(app.getPath('userData'), 'voicetype-data')
const migrationMarker = path.join(app.getPath('userData'), '.prattle-migration-done')

export function ensureUserDataDir(): void {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  // Migrate legacy voicetype-data to prattle-data (one-time)
  if (fs.existsSync(legacyDataPath) && !fs.existsSync(migrationMarker)) {
    try {
      const files = fs.readdirSync(legacyDataPath)
      for (const file of files) {
        const src = path.join(legacyDataPath, file)
        const dest = path.join(userDataPath, file)
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest)
        }
      }
      // Write marker so migration never re-runs
      fs.writeFileSync(migrationMarker, new Date().toISOString(), 'utf-8')
      console.log('[Prattle] Migrated data from voicetype-data to prattle-data')
    } catch (e) {
      console.error('[Prattle] Migration error:', e)
    }
  }
}

export function getDataFilePath(filename: string): string {
  return path.join(userDataPath, filename)
}

export function readJsonFile(filename: string, defaultValue: Record<string, unknown> = {}): Record<string, unknown> {
  const filePath = getDataFilePath(filename)
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error(`[Prattle] Error reading ${filename}:`, e)
  }
  return defaultValue
}

export function writeJsonFile(filename: string, data: Record<string, unknown>): void {
  const filePath = getDataFilePath(filename)
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error(`[Prattle] Error writing ${filename}:`, e)
  }
}

export function initializeDefaultData(): void {
  // Default settings
  if (!fs.existsSync(getDataFilePath('settings.json'))) {
    writeJsonFile('settings.json', {
      speechProvider: 'deepgram',
      llmProvider: 'claude',
      apiKeys: {},
      currentModeIndex: 0,
      customPrompts: {},
      fontSize: 16,
      theme: 'dark',
      micGain: 100,
      hotkey: 'RightAlt',
      startOnLogin: true,
      trainingEnabled: false,
    })
  } else {
    // Migrate existing settings to new format
    const settings = readJsonFile('settings.json')
    let changed = false

    // Remove old fields
    if ('activePlatform' in settings) {
      delete settings.activePlatform
      changed = true
    }
    if ('autoProcess' in settings) {
      delete settings.autoProcess
      changed = true
    }
    if ('globalRules' in settings) {
      delete settings.globalRules
      changed = true
    }
    if ('learningMode' in settings) {
      delete settings.learningMode
      changed = true
    }

    // Add new fields
    if (settings.currentModeIndex === undefined) {
      settings.currentModeIndex = 0
      changed = true
    }
    if (settings.customPrompts === undefined) {
      settings.customPrompts = {}
      changed = true
    }
    if (settings.hotkey === undefined || settings.hotkey === 'Ctrl+Shift+Space') {
      settings.hotkey = 'RightAlt'
      changed = true
    }
    if (settings.micGain === undefined) {
      settings.micGain = 100
      changed = true
    }
    if (settings.trainingEnabled === undefined) {
      settings.trainingEnabled = false
      changed = true
    }
    if (settings.startOnLogin === undefined) {
      settings.startOnLogin = true
      changed = true
    }

    if (changed) writeJsonFile('settings.json', settings)
  }

  // Default dictionary
  if (!fs.existsSync(getDataFilePath('dictionary.json'))) {
    writeJsonFile('dictionary.json', {
      replacements: {},
    })
  }

  // Default learned patterns
  if (!fs.existsSync(getDataFilePath('learned-patterns.json'))) {
    writeJsonFile('learned-patterns.json', {
      patterns: [],
    })
  }
}

/**
 * Validate that a file path is within the user data directory.
 * Rejects path traversal attempts and paths outside userDataPath.
 */
export function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  return resolved.startsWith(userDataPath)
}
