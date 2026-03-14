// LLM service for text processing, tone adjustment, and learning

import type { Settings, Dictionary, LearnedPattern, ChatMessage } from '../types'
import { BASE_RULES, DICTATION_MODES } from '../constants/modes'
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
  const systemPrompt = `You are a text editor. The user previously dictated the following text:

"${originalText}"

The user has now spoken a modification instruction. Apply their requested changes to the original text.
Preserve meaning and tone unless the instruction specifically asks to change it.
Output ONLY the modified text. No commentary, no preamble, no quotes.`

  return { systemPrompt, userMessage: instruction }
}

// Revise a mode prompt via AI chat instruction (for ModesView prompt editor)
export async function revisePrompt(
  currentPrompt: string,
  userInstruction: string,
  settings: Settings
): Promise<string> {
  const systemPrompt = `You are a prompt engineer helping the user customize their dictation mode prompt.

The current prompt is:
"${currentPrompt}"

The user wants to modify this prompt. Apply their requested changes and return the updated prompt text.
Output ONLY the revised prompt text. No commentary, no preamble, no quotes around it.`

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

  const prompt = `You are analyzing edits a user made to dictated text to learn their preferences.

ORIGINAL TEXT (after AI processing):
"${originalText}"

USER'S EDITED VERSION:
"${editedText}"

CONTEXT: This text was for the "${modeId}" dictation mode.

Analyze what the user changed and why. If you can identify a clear, reusable pattern or preference, respond with EXACTLY this JSON format:
{"description": "Brief human-readable description of the pattern", "rule": "Specific rule to apply in future processing"}

If the changes are too minor, random, or context-specific to be a useful pattern, respond with exactly: null

Examples of good patterns:
{"description": "Prefers 'Hi' over 'Hello' in emails", "rule": "Use 'Hi' instead of 'Hello' as email greetings"}
{"description": "Removes exclamation marks in professional context", "rule": "Avoid exclamation marks in professional emails"}
{"description": "Always spells out numbers under 10", "rule": "Spell out numbers one through nine instead of using digits"}

Respond with ONLY the JSON or null, nothing else.`

  try {
    const response = await processTextViaProxy(
      prompt,
      'You are a text analysis assistant. Respond only with valid JSON or the word null.',
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
  } catch (error) {
    console.error('Edit analysis failed:', error)
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
