// Transcription provider implementations (Whisper, Deepgram, Gemini)
// Extracted from speechService.ts to keep that file focused on audio capture.

import { fetchWithTimeout } from '../utils/fetchWithTimeout'

// Minimum audio blob size in bytes. Anything smaller is likely silence/noise
// and would cause hallucinations from speech models.
export const MIN_AUDIO_BLOB_SIZE = 3000

// Known hallucination phrases that speech models produce from silence/noise.
// Whisper in particular loves to output these when given near-empty audio.
// Matched case-insensitively after trimming punctuation.
export const HALLUCINATION_PHRASES = [
  'the quick brown fox jumps over the lazy dog',
  'the quick brown fox',
  'thank you for watching',
  'thanks for watching',
  'subscribe to my channel',
  'please subscribe',
  'like and subscribe',
  'thank you for listening',
  'thanks for listening',
  'see you next time',
  'see you in the next video',
  'bye bye',
  'goodbye',
  'you',
  'bye',
  'i\'m sorry',
  'okay',
  'so',
  'um',
  'uh',
  'hmm',
  'mhm',
  'yeah',
  'oh',
  'ah',
  'huh',
]

/**
 * Check if transcription is a known hallucination phrase.
 * Strips punctuation and compares case-insensitively.
 */
export function isHallucinatedPhrase(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.,!?;:'"()\[\]{}\-—…]/g, '').trim()
  return HALLUCINATION_PHRASES.includes(normalized)
}

// Transcribe audio using OpenAI Whisper API
export async function transcribeWithWhisper(audioBlob: Blob, apiKey: string): Promise<string> {
  if (audioBlob.size < MIN_AUDIO_BLOB_SIZE) return '' // Too small -- would hallucinate

  const formData = new FormData()

  // Whisper expects a file, create one from the blob
  const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type })
  formData.append('file', audioFile)
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')
  formData.append('response_format', 'text')
  formData.append('temperature', '0') // Reduce hallucination -- 0 = most deterministic
  // Prompt hint helps Whisper understand context and reduces hallucination on short clips
  formData.append('prompt', 'Voice dictation transcription.')

  const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
    timeout: 30000,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Whisper API error: ${response.status} - ${error}`)
  }

  return (await response.text()).trim()
}

// Transcribe using Deepgram API
export async function transcribeWithDeepgram(audioBlob: Blob, apiKey: string): Promise<string> {
  if (audioBlob.size < MIN_AUDIO_BLOB_SIZE) return '' // Too small -- would hallucinate

  const arrayBuffer = await audioBlob.arrayBuffer()

  // Scale timeout with audio size: 15s base + 1s per MB of audio
  // A 30-min webm/opus recording is roughly 3-5MB, so this gives plenty of headroom
  const timeoutMs = 15000 + Math.ceil(audioBlob.size / (1024 * 1024)) * 1000

  const response = await fetchWithTimeout('https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audioBlob.type,
    },
    body: arrayBuffer,
    timeout: timeoutMs,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Deepgram API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const alternative = result.results?.channels?.[0]?.alternatives?.[0]
  if (!alternative) return ''

  // Check confidence -- reject low-confidence transcriptions that are likely noise
  const confidence = alternative.confidence ?? 1
  if (confidence < 0.4) {
    return ''
  }

  return alternative.transcript || ''
}

// Transcribe audio using Google Gemini (supports audio input natively)
export async function transcribeWithGemini(audioBlob: Blob, apiKey: string): Promise<string> {
  // Safety: reject tiny audio blobs that would cause hallucination
  // A 500ms webm/opus clip is typically 3-5KB; anything under MIN_AUDIO_BLOB_SIZE is likely silence/noise
  if (audioBlob.size < MIN_AUDIO_BLOB_SIZE) {
    return ''
  }

  // Convert audio blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  // Determine the MIME type for Gemini
  const mimeType = audioBlob.type.split(';')[0] // e.g., "audio/webm"

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              }
            },
            {
              text: `Transcribe the exact words spoken in this audio. Output ONLY the spoken words, nothing else. No labels, no quotes, no commentary. Do NOT repeat or duplicate any part of the transcription. If silent or unclear, respond with exactly: [EMPTY]`
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
        }
      }),
      timeout: 30000,
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini transcription error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

  // Catch hallucination markers and empty signals
  if (!text || text === '[EMPTY]' || text.toLowerCase() === 'empty' || text === '""' || text === "''") {
    return ''
  }

  // Strip any quotation marks Gemini might wrap around the transcription
  let cleaned = text.replace(/^["']|["']$/g, '').trim()

  // Detect and remove duplicated content (Gemini sometimes repeats the transcription)
  cleaned = removeDuplicatedContent(cleaned)

  return cleaned
}

// Detect and remove duplicated content in transcription output
// Gemini sometimes repeats the entire transcription or large chunks of it
export function removeDuplicatedContent(text: string): string {
  if (text.length < 20) return text

  // Check if the text is roughly the same thing repeated (with some variation)
  const half = Math.floor(text.length / 2)
  const firstHalf = text.slice(0, half).trim().toLowerCase()
  const secondHalf = text.slice(half).trim().toLowerCase()

  // If the two halves are very similar (>80% overlap by words), take just the first half
  const firstWords = firstHalf.split(/\s+/)
  const secondWords = secondHalf.split(/\s+/)
  if (firstWords.length > 3 && secondWords.length > 3) {
    let matchCount = 0
    const minLen = Math.min(firstWords.length, secondWords.length)
    for (let i = 0; i < minLen; i++) {
      if (firstWords[i] === secondWords[i]) matchCount++
    }
    if (matchCount / minLen > 0.8) {
      return text.slice(0, half).trim()
    }
  }

  // Also check for exact substring repetition (text appears twice in a row)
  for (let len = Math.floor(text.length / 2); len >= 10; len--) {
    const chunk = text.slice(0, len).trim()
    const rest = text.slice(len).trim()
    if (rest.toLowerCase().startsWith(chunk.toLowerCase())) {
      return chunk
    }
  }

  return text
}
