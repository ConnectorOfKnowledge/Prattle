import { useState, useEffect, useCallback } from 'react'
import { HiClipboardDocument, HiTrash, HiArrowPath, HiClock, HiDocumentText } from 'react-icons/hi2'
import type { HistoryEntry } from '../types'

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getHistory()
      setEntries(data as HistoryEntry[])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleCopy = useCallback(async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.processedText)
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }, [])

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('Clear all history? This cannot be undone.')) return
    await window.electronAPI.clearHistory()
    setEntries([])
  }, [])

  return (
    <div className="p-5 max-w-2xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-cd-text font-semibold text-base">History</h2>
          <p className="text-cd-subtle text-xs mt-0.5">
            Last {entries.length} transcription{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            className="p-2 rounded-lg text-cd-subtle hover:text-cd-text hover:bg-white/5 transition-all"
            title="Refresh"
          >
            <HiArrowPath className="w-4 h-4" />
          </button>
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
            >
              <HiTrash className="w-3.5 h-3.5" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-cd-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <HiDocumentText className="w-12 h-12 text-cd-subtle/30 mx-auto mb-3" />
          <p className="text-cd-subtle text-sm">No history yet</p>
          <p className="text-cd-subtle/60 text-xs mt-1">Transcriptions will appear here after you dictate</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id
            const isCopied = copiedId === entry.id
            const displayText = entry.processedText || entry.rawText

            return (
              <div
                key={entry.id}
                className="bg-cd-card border border-white/5 rounded-xl overflow-hidden"
              >
                {/* Entry header */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-cd-text text-sm leading-relaxed cursor-pointer ${
                        isExpanded ? '' : 'line-clamp-3'
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      {displayText}
                    </p>
                    {displayText.length > 200 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="text-xs text-cd-accent hover:text-cd-accent/80 mt-1 transition-colors"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-xs text-cd-subtle">
                        <HiClock className="w-3 h-3" />
                        {formatDate(entry.createdAt)}
                      </span>
                      {entry.durationMs > 0 && (
                        <span className="text-xs text-cd-subtle">
                          {formatDuration(entry.durationMs)}
                        </span>
                      )}
                      {entry.mode && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-cd-accent/10 text-cd-accent/80 font-medium">
                          {entry.mode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={() => handleCopy(entry)}
                    className={`shrink-0 p-1.5 rounded-lg transition-all ${
                      isCopied
                        ? 'bg-green-500/20 text-green-400'
                        : 'text-cd-subtle hover:text-cd-text hover:bg-white/5'
                    }`}
                    title={isCopied ? 'Copied!' : 'Copy to clipboard'}
                  >
                    <HiClipboardDocument className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
