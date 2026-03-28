// LLM service for text processing, tone adjustment, and learning

import type { Settings, Dictionary, LearnedPattern, ChatMessage } from '../types'
import { DICTATION_MODES } from '../constants/modes'
import {
  BASE_RULES,
  REWRITE_SYSTEM_PROMPT_PREFIX,
  REWRITE_SYSTEM_PROMPT_SUFFIX,
  REVISE_PROMPT_SYSTEM_PROMPT_PREFIX,
  REVISE_PROMPT_SYSTEM_PROMPT_SUFFIX,
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_USER_PROMPT_TEMPLATE,
} from '../constants/prompts'
import { processTextViaProxy, chatViaProxy } from './proxyService'

// Build the system prompt and user message for text processing (used by proxy path)
export function buildProcessPrompt(
  rawText: string,
  modeIndex: number,
  dictionary: Dictionary,
  learnedPatterns: LearnedPattern[],
  settings: Settings
): { systemPrompt: string; userMessage: string; processedText: string } | null {
  const mode = DICTATION_MODES[modeIndex]
  if (!mode) return null

  // Apply dictionary replacements first
  const text = applyDictionary(rawText, dictionary)

  // Build system prompt from base rules + mode + custom prompt override + learned patterns
  const customPrompt = settings.customPrompts?.[modeIndex]
  const modeDescription = customPrompt || mode.description

  let systemPrompt = `${BASE_RULES}\n\nMODE: ${mode.name}\n${modeDescription}`

  // Add learned patterns that apply to this mode
  const activePatterns = learnedPatterns.filter(p =>
    p.active && (p.platform === 'all' || p.platform === mode.id)
  )

  if (activePatterns.length > 0) {
    const patternsText = activePatterns
      .map(p => `- ${p.description}: ${p.rule}`)
      .join('\n')
    systemPrompt += `\n\nAdditionally, apply these learned preferences from the user:\n${patternsText}`
  }

  const userMessage = `[Voice dictation transcription to clean up]:\n${text}`

  return { systemPrompt, userMessage, processedText: text }
}

// Build the system prompt for rewrite mode (used by proxy path)
export function buildRewritePrompt(
  originalText: string,
  instruction: string,
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `${REWRITE_SYSTEM_PROMPT_PREFIX}

---
${originalText}
---

${REWRITE_SYSTEM_PROMPT_SUFFIX}`

  return { systemPrompt, userMessage: instruction }
}

// Revise a mode prompt via AI chat instruction (for ModesView prompt editor)
export async function revisePrompt(
  currentPrompt: string,
  userInstruction: string,
  settings: Settings
): Promise<string> {
  const systemPrompt = `${REVISE_PROMPT_SYSTEM_PROMPT_PREFIX}

CURRENT PROMPT:
---
${currentPrompt}
---

${REVISE_PROMPT_SYSTEM_PROMPT_SUFFIX}`

  return await processTextViaProxy(userInstruction, systemPrompt, settings.llmProvider)
}

// Multi-turn chat with AI for the Modify/Chat panel
export async function chatWithAI(
  messages: ChatMessage[],
  systemPrompt: string,
  settings: Settings
): Promise<string> {
  return await chatViaProxy(messages, systemPrompt, settings.llmProvider)
}

// Analyze edits to extract learning patterns
export async function analyzeEdits(
  originalText: string,
  editedText: string,
  modeId: string,
  settings: Settings
): Promise<{ description: string; rule: string } | null> {
  // Don't analyze if texts are identical or too short
  if (originalText.trim() === editedText.trim()) return null
  if (originalText.length < 10 || editedText.length < 10) return null

  const prompt = ANALYSIS_USER_PROMPT_TEMPLATE(originalText, editedText, modeId)

  try {
    const response = await processTextViaProxy(
      prompt,
      ANALYSIS_SYSTEM_PROMPT,
      settings.llmProvider
    )

    const cleaned = response.trim()
    if (cleaned === 'null' || cleaned === '') return null

    // Try to parse JSON from response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.description && parsed.rule) {
      return { description: parsed.description, rule: parsed.rule }
    }
    return null
  } catch (error: unknown) {
    console.error('[Prattle] Edit analysis failed:', error)
    return null
  }
}

function applyDictionary(text: string, dictionary: Dictionary): string {
  let result = text
  for (const [find, replace] of Object.entries(dictionary.replacements)) {
    // Case-insensitive whole-word replacement
    const regex = new RegExp(`\\b${escapeRegex(find)}\\b`, 'gi')
    result = result.replace(regex, replace)
  }
  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
