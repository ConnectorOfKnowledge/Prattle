import { getAccessToken } from './authService'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

const PROXY_BASE = 'https://prattle.app'  // TODO: Update with actual domain

// Convert Blob to base64 string
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  // Process in chunks to avoid O(n²) string concatenation
  const bytes = new Uint8Array(buffer)
  const CHUNK_SIZE = 8192
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    chunks.push(String.fromCharCode(...chunk))
  }
  return btoa(chunks.join(''))
}

/**
 * Transcribe audio via the proxy server (paid tier)
 */
export async function transcribeViaProxy(
  audioBlob: Blob,
  provider: string = 'gemini'
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const base64Audio = await blobToBase64(audioBlob)

  const response = await fetchWithTimeout(`${PROXY_BASE}/api/speech/transcribe`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio: base64Audio,
      mimeType: audioBlob.type.split(';')[0],
      provider,
    }),
    timeout: 30000,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Proxy error' }))
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}

/**
 * Process text via the proxy server (paid tier)
 */
export async function processTextViaProxy(
  text: string,
  systemPrompt: string,
  provider: string = 'gemini'
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const response = await fetchWithTimeout(`${PROXY_BASE}/api/llm/process`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, systemPrompt, provider }),
    timeout: 30000,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Proxy error' }))
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}

/**
 * Multi-turn chat via the proxy server (paid tier)
 */
export async function chatViaProxy(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  provider: string = 'gemini'
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const response = await fetchWithTimeout(`${PROXY_BASE}/api/llm/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, systemPrompt, provider }),
    timeout: 30000,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Proxy error' }))
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}
