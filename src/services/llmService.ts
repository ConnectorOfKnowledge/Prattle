// LLM service for text processing, tone adjustment, and learning

import type { Settings, Dictionary, LearnedPattern, ChatMessage } from '../types'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { BASE_RULES, DICTATION_MODES } from '../constants/modes'

// Build the system prompt and user message for text processing (used by both direct and proxy paths)
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

// Build the system prompt for rewrite mode (used by both direct and proxy paths)
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

// Process text through the selected LLM using a mode index
export async function processText(
  rawText: string,
  modeIndex: number,
  dictionary: Dictionary,
  learnedPatterns: LearnedPattern[],
  settings: Settings
): Promise<string> {
  const mode = DICTATION_MODES[modeIndex]
  if (!mode) return rawText

  // Apply dictionary replacements first
  let text = applyDictionary(rawText, dictionary)

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

  // Call the appropriate LLM
  const apiKey = getApiKeyForLLM(settings)

  if (!apiKey) {
    // No API key configured - return dictionary-processed text
    return text
  }

  // Wrap the raw transcription with context so the LLM knows what it's working with
  const userMessage = `[Voice dictation transcription to clean up]:\n${text}`

  try {
    switch (settings.llmProvider) {
      case 'gemini':
        return await callGemini(userMessage, systemPrompt, apiKey)
      case 'claude':
        return await callClaude(userMessage, systemPrompt, apiKey)
      case 'openai':
        return await callOpenAI(userMessage, systemPrompt, apiKey)
      default:
        return text
    }
  } catch (error) {
    console.error('LLM processing failed:', error)
    throw error
  }
}

// Rewrite previously dictated text based on a spoken instruction
export async function rewriteText(
  originalText: string,
  instruction: string,
  settings: Settings
): Promise<string> {
  const apiKey = getApiKeyForLLM(settings)
  if (!apiKey) throw new Error('No API key configured')

  const systemPrompt = `You are a text editor. The user previously dictated the following text:

"${originalText}"

The user has now spoken a modification instruction. Apply their requested changes to the original text.
Preserve meaning and tone unless the instruction specifically asks to change it.
Output ONLY the modified text. No commentary, no preamble, no quotes.`

  try {
    switch (settings.llmProvider) {
      case 'gemini':
        return await callGemini(instruction, systemPrompt, apiKey)
      case 'claude':
        return await callClaude(instruction, systemPrompt, apiKey)
      case 'openai':
        return await callOpenAI(instruction, systemPrompt, apiKey)
      default:
        throw new Error('Unknown LLM provider')
    }
  } catch (error) {
    console.error('Rewrite failed:', error)
    throw error
  }
}

// Revise a mode prompt via AI chat instruction (for ModesView prompt editor)
export async function revisePrompt(
  currentPrompt: string,
  userInstruction: string,
  settings: Settings
): Promise<string> {
  const apiKey = getApiKeyForLLM(settings)
  if (!apiKey) throw new Error('No API key configured')

  const systemPrompt = `You are a prompt engineer helping the user customize their dictation mode prompt.

The current prompt is:
"${currentPrompt}"

The user wants to modify this prompt. Apply their requested changes and return the updated prompt text.
Output ONLY the revised prompt text. No commentary, no preamble, no quotes around it.`

  try {
    switch (settings.llmProvider) {
      case 'gemini':
        return await callGemini(userInstruction, systemPrompt, apiKey)
      case 'claude':
        return await callClaude(userInstruction, systemPrompt, apiKey)
      case 'openai':
        return await callOpenAI(userInstruction, systemPrompt, apiKey)
      default:
        throw new Error('Unknown LLM provider')
    }
  } catch (error) {
    console.error('Prompt revision failed:', error)
    throw error
  }
}

// Multi-turn chat with AI for the Modify/Chat panel
export async function chatWithAI(
  messages: ChatMessage[],
  systemPrompt: string,
  settings: Settings
): Promise<string> {
  const apiKey = getApiKeyForLLM(settings)
  if (!apiKey) throw new Error('No API key configured for chat')

  try {
    switch (settings.llmProvider) {
      case 'gemini':
        return await callGeminiChat(messages, systemPrompt, apiKey)
      case 'claude':
        return await callClaudeChat(messages, systemPrompt, apiKey)
      case 'openai':
        return await callOpenAIChat(messages, systemPrompt, apiKey)
      default:
        throw new Error('Unknown LLM provider')
    }
  } catch (error) {
    console.error('Chat failed:', error)
    throw error
  }
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

  const apiKey = getApiKeyForLLM(settings)
  if (!apiKey) return null

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
    let response: string
    switch (settings.llmProvider) {
      case 'gemini':
        response = await callGemini(prompt, 'You are a text analysis assistant. Respond only with valid JSON or the word null.', apiKey)
        break
      case 'claude':
        response = await callClaude(prompt, 'You are a text analysis assistant. Respond only with valid JSON or the word null.', apiKey)
        break
      case 'openai':
        response = await callOpenAI(prompt, 'You are a text analysis assistant. Respond only with valid JSON or the word null.', apiKey)
        break
      default:
        return null
    }

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

function getApiKeyForLLM(settings: Settings): string | undefined {
  switch (settings.llmProvider) {
    case 'gemini': return settings.apiKeys.gemini
    case 'claude': return settings.apiKeys.claude
    case 'openai': return settings.apiKeys.openai
    default: return undefined
  }
}

// ---- Provider Implementations (Single-turn) ----

async function callGemini(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 65536,
        }
      }),
      timeout: 30000,
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.candidates?.[0]?.content?.parts?.[0]?.text || text
}

async function callClaude(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    }),
    timeout: 30000,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.content?.[0]?.text || text
}

async function callOpenAI(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 16384,
    }),
    timeout: 30000,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.choices?.[0]?.message?.content || text
}

// ---- Provider Implementations (Multi-turn Chat) ----

async function callGeminiChat(messages: ChatMessage[], systemPrompt: string, apiKey: string): Promise<string> {
  // Convert ChatMessage format to Gemini format
  const geminiContents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
        }
      }),
      timeout: 30000,
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini chat error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callClaudeChat(messages: ChatMessage[], systemPrompt: string, apiKey: string): Promise<string> {
  const claudeMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }))

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
    }),
    timeout: 30000,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude chat error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.content?.[0]?.text || ''
}

async function callOpenAIChat(messages: ChatMessage[], systemPrompt: string, apiKey: string): Promise<string> {
  const openaiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
  ]

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: openaiMessages,
      temperature: 0.4,
      max_tokens: 4096,
    }),
    timeout: 30000,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI chat error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  return result.choices?.[0]?.message?.content || ''
}
