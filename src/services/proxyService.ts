import { getAccessToken } from './authService'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

const PROXY_BASE = 'https://voicetype-web.vercel.app'

// Convert Blob to base64 string
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Get a Deepgram streaming token from the proxy (authenticated users only)
 */
export async function getStreamToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const response = await fetchWithTimeout(`${PROXY_BASE}/api/speech/stream-token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to get stream token' }))
    if (err.code === 'TRIAL_EXPIRED') {
      throw new Error('TRIAL_EXPIRED')
    }
    throw new Error(err.error || `Stream token error: ${response.status}`)
  }

  const result = await response.json()
  return result.token
}

/**
 * Transcribe audio via the proxy server
 */
export async function transcribeViaProxy(
  audioBlob: Blob,
  provider: string = 'deepgram'
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  // Skip tiny audio blobs that would fail at Deepgram (corrupt/empty webm container)
  if (audioBlob.size < 3000) {
    console.log(`[Prattle] Audio blob too small for proxy (${audioBlob.size} bytes), skipping`)
    return ''
  }

  const base64Audio = await blobToBase64(audioBlob)

  const response = await fetchWithTimeout(`${PROXY_BASE}/api/speech/transcribe`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio: base64Audio,
      mimeType: audioBlob.type || 'audio/webm',
      provider,
    }),
    timeout: 60000,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Proxy error' }))
    if (err.code === 'TRIAL_EXPIRED') {
      throw new Error('TRIAL_EXPIRED')
    }
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}

/**
 * Process text via the proxy server
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
    if (err.code === 'TRIAL_EXPIRED') {
      throw new Error('TRIAL_EXPIRED')
    }
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}

/**
 * Multi-turn chat via the proxy server
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
    if (err.code === 'TRIAL_EXPIRED') {
      throw new Error('TRIAL_EXPIRED')
    }
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}
