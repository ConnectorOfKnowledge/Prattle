import { useState, useRef, useEffect } from 'react'
import { HiXMark, HiPaperAirplane, HiCheckCircle } from 'react-icons/hi2'
import type { Settings, ChatMessage } from '../types'
import { chatWithAI } from '../services/llmService'

interface ChatPanelProps {
  contextText: string
  contextLabel: string
  systemInstruction: string
  onApply: (newText: string) => void
  onClose: () => void
  settings: Settings
}

export default function ChatPanel({ contextText, contextLabel, systemInstruction, onApply, onClose, settings }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastModifiedText, setLastModifiedText] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const extractModifiedText = (response: string): string | null => {
    const match = response.match(/<modified>([\s\S]*?)<\/modified>/)
    if (match) return match[1].trim()
    return null
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setApplied(false)

    try {
      const response = await chatWithAI(newMessages, systemInstruction, settings)
      const assistantMessage: ChatMessage = { role: 'assistant', content: response }
      setMessages([...newMessages, assistantMessage])

      // Check for modified text
      const modified = extractModifiedText(response)
      if (modified) {
        setLastModifiedText(modified)
      }
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to get response'}`
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = () => {
    if (lastModifiedText) {
      onApply(lastModifiedText)
      setApplied(true)
      setLastModifiedText(null)
      setTimeout(() => setApplied(false), 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Render message content, hiding the <modified> tags from display
  const renderContent = (content: string) => {
    const parts = content.split(/<modified>[\s\S]*?<\/modified>/)
    if (parts.length === 1) return content

    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 && (
          <span className="inline-block bg-cd-rewrite/20 text-cd-rewrite text-xs px-2 py-0.5 rounded mt-1">
            Modified version ready to apply
          </span>
        )}
      </span>
    ))
  }

  return (
    <div className="w-80 border-l border-white/5 bg-cd-card flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="font-medium text-sm text-cd-text">Modify with AI</h3>
        <button onClick={onClose} className="btn-icon">
          <HiXMark className="w-4 h-4" />
        </button>
      </div>

      {/* Context preview */}
      <div className="px-4 py-2 border-b border-white/10 bg-cd-bg">
        <p className="text-[10px] font-medium text-cd-subtle uppercase tracking-wider">{contextLabel}</p>
        <p className="text-xs text-cd-subtle mt-1 line-clamp-3">{contextText || 'No content'}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-cd-subtle/60 mt-8">
            <p>Ask the AI to make changes.</p>
            <p className="mt-1">e.g., "Make it more formal" or "Add a rule about bullet points"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-cd-accent text-white'
                : 'bg-white/5 text-cd-text'
            }`}>
              <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {renderContent(msg.content)}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-cd-subtle/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-cd-subtle/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-cd-subtle/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Apply button */}
      {lastModifiedText && (
        <div className="px-3 py-2 border-t border-white/10">
          <button
            onClick={handleApply}
            className="w-full btn-primary text-sm flex items-center justify-center gap-2"
          >
            <HiCheckCircle className="w-4 h-4" />
            Apply Suggestion
          </button>
        </div>
      )}

      {applied && (
        <div className="px-3 py-1.5 bg-green-900/20 text-green-400 text-xs text-center">
          Applied!
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-white/5">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for changes..."
            className="textarea-field flex-1 resize-none text-sm"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="self-end p-2 rounded-lg bg-cd-accent text-white hover:bg-cd-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <HiPaperAirplane className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
