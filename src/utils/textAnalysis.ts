import type { LearnedPattern } from '../types'

/**
 * Find simple word-level swaps between two texts.
 * Only detects swaps in texts of similar length (not major rewrites).
 */
export function findWordSwaps(original: string, corrected: string): { from: string; to: string }[] {
  const origWords = original.split(/\s+/)
  const corrWords = corrected.split(/\s+/)
  const swaps: { from: string; to: string }[] = []

  if (Math.abs(origWords.length - corrWords.length) > 2) return swaps

  const minLen = Math.min(origWords.length, corrWords.length)
  for (let i = 0; i < minLen; i++) {
    const ow = origWords[i].replace(/[.,!?;:'"]/g, '')
    const cw = corrWords[i].replace(/[.,!?;:'"]/g, '')
    if (ow.toLowerCase() !== cw.toLowerCase() && ow.length > 1 && cw.length > 1) {
      swaps.push({ from: ow, to: cw })
    }
  }
  return swaps
}

/**
 * Count how many times a specific word swap appears in existing patterns.
 */
export function countWordSwapInPatterns(patterns: LearnedPattern[], from: string, to: string): number {
  let count = 0
  for (const p of patterns) {
    if (!p.originalText || !p.correctedText) continue
    const swaps = findWordSwaps(p.originalText, p.correctedText)
    if (swaps.some(s => s.from.toLowerCase() === from.toLowerCase() && s.to.toLowerCase() === to.toLowerCase())) {
      count++
    }
  }
  return count
}
