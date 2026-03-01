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
          <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded mt-1">
            Modified version ready to apply
          </span>
        )}
      </span>
    ))
  }

  return (
    <div className="w-80 border-l border-surface-200 bg-white flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
        <h3 className="font-medium text-sm text-gray-800">Modify with AI</h3>
        <button onClick={onClose} className="btn-icon">
          <HiXMark className="w-4 h-4" />
        </button>
      </div>

      {/* Context preview */}
      <div className="px-4 py-2 border-b border-surface-100 bg-surface-50">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{contextLabel}</p>
        <p className="text-xs text-gray-600 mt-1 line-clamp-3">{contextText || 'No content'}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-gray-400 mt-8">
            <p>Ask the AI to make changes.</p>
            <p className="mt-1">e.g., "Make it more formal" or "Add a rule about bullet points"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-primary-500 text-white'
                : 'bg-surface-100 text-gray-800'
            }`}>
              <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {renderContent(msg.content)}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-surface-100 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Apply button */}
      {lastModifiedText && (
        <div className="px-3 py-2 border-t border-surface-100">
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
        <div className="px-3 py-1.5 bg-green-50 text-green-700 text-xs text-center">
          Applied!
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-surface-200">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for changes..."
            className="flex-1 resize-none border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="self-end p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <HiPaperAirplane className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
