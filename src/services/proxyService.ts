import { getAccessToken } from './authService'

const PROXY_BASE = 'https://prattle.app'  // TODO: Update with actual domain

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
 * Transcribe audio via the proxy server (paid tier)
 */
export async function transcribeViaProxy(
  audioBlob: Blob,
  provider: string = 'gemini'
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const base64Audio = await blobToBase64(audioBlob)

  const response = await fetch(`${PROXY_BASE}/api/speech/transcribe`, {
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

  const response = await fetch(`${PROXY_BASE}/api/llm/process`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, systemPrompt, provider }),
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

  const response = await fetch(`${PROXY_BASE}/api/llm/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, systemPrompt, provider }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Proxy error' }))
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const result = await response.json()
  return result.text || ''
}
