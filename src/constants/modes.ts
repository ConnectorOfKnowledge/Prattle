// Re-export BASE_RULES from prompts.ts for backwards compatibility
export { BASE_RULES } from './prompts'

export const DICTATION_MODES = [
  {
    id: 'clean',
    name: 'Clean',
    description: 'Verbatim transcription with correct punctuation. Change NOTHING about what the speaker said. Do not rephrase, do not swap words, do not restructure. Your only job: fix punctuation, capitalization, and obvious speech recognition errors (wrong homophones, garbled words). If the transcription says "I wanna" keep "I wanna." If it says "gonna" keep "gonna." The result should be exactly what the person said, just properly punctuated.',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Polish for a business or formal context. You may improve word choice and sentence flow, but keep it sounding like the speaker wrote it, not like a template. Be direct and confident, not corporate or stiff.',
  },
  {
    id: 'casual',
    name: 'Casual',
    description: 'Keep it relaxed and conversational, like texting a friend. Use contractions, informal phrasing, and the speaker\'s natural rhythm. Do not formalize anything.',
  },
] as const

export type RecordingState = 'idle' | 'recording' | 'processing' | 'rewrite_recording'
