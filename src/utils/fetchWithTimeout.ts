/**
 * Wrapper around fetch() that adds a timeout via AbortController.
 * Prevents infinite hangs when servers are unreachable or slow.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 15000, ...fetchInit } = init || {}

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`)
    }
    throw error
  } finally {
    clearTimeout(id)
  }
}
