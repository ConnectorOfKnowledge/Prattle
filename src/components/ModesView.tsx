import { useState, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { DICTATION_MODES } from '../constants/modes'
import { revisePrompt } from '../services/llmService'
import { HiPaperAirplane, HiArrowPath, HiChevronDown, HiChevronUp } from 'react-icons/hi2'

export default function ModesView() {
  const { settings, saveSettingsToFile } = useAppStore()
  const [expandedMode, setExpandedMode] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [isRevising, setIsRevising] = useState(false)
  const [reviseError, setReviseError] = useState<string | null>(null)

  if (!settings) return null

  const currentModeIndex = settings.currentModeIndex

  const handleModeSelect = async (index: number) => {
    const newSettings = { ...settings, currentModeIndex: index }
    await saveSettingsToFile(newSettings)
  }

  const getPromptForMode = (index: number): string => {
    return settings.customPrompts?.[index] || DICTATION_MODES[index].description
  }

  const isCustomized = (index: number): boolean => {
    return !!settings.customPrompts?.[index]
  }

  const handleResetPrompt = async (index: number) => {
    const newCustomPrompts = { ...settings.customPrompts }
    delete newCustomPrompts[index]
    const newSettings = { ...settings, customPrompts: newCustomPrompts }
    await saveSettingsToFile(newSettings)
  }

  const handleRevisePrompt = useCallback(async (index: number) => {
    if (!chatInput.trim() || isRevising || !settings) return

    setIsRevising(true)
    setReviseError(null)

    try {
      const currentPrompt = getPromptForMode(index)
      const revised = await revisePrompt(currentPrompt, chatInput.trim(), settings)

      const newCustomPrompts = { ...settings.customPrompts, [index]: revised }
      const newSettings = { ...settings, customPrompts: newCustomPrompts }
      await saveSettingsToFile(newSettings)
      setChatInput('')
    } catch (error: any) {
      setReviseError(error.message || 'Failed to revise prompt')
    } finally {
      setIsRevising(false)
    }
  }, [chatInput, isRevising, settings])

  const handleDirectEdit = async (index: number, newPrompt: string) => {
    const newCustomPrompts = { ...settings.customPrompts, [index]: newPrompt }
    const newSettings = { ...settings, customPrompts: newCustomPrompts }
    await saveSettingsToFile(newSettings)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-5 slide-in">
      <h2 className="text-lg font-semibold text-cd-text">Dictation Modes</h2>

      {/* Mode picker (segmented control) */}
      <div className="flex bg-cd-card rounded-xl p-1 border border-white/5">
        {DICTATION_MODES.map((mode, index) => (
          <button
            key={mode.id}
            onClick={() => handleModeSelect(index)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              currentModeIndex === index
                ? 'bg-cd-accent text-white shadow-sm'
                : 'text-cd-subtle hover:text-cd-text'
            }`}
          >
            {mode.name}
          </button>
        ))}
      </div>

      {/* Mode cards */}
      <div className="space-y-3">
        {DICTATION_MODES.map((mode, index) => {
          const expanded = expandedMode === index
          const customized = isCustomized(index)
          const prompt = getPromptForMode(index)

          return (
            <div
              key={mode.id}
              className={`rounded-2xl border transition-all ${
                currentModeIndex === index
                  ? 'bg-cd-card border-cd-accent/30'
                  : 'bg-cd-card border-white/5'
              }`}
            >
              {/* Card header */}
              <button
                onClick={() => setExpandedMode(expanded ? null : index)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-cd-accent">{mode.name}</span>
                  {customized && (
                    <span className="text-[10px] font-medium bg-cd-accent/20 text-cd-accent px-2 py-0.5 rounded-full">
                      Customized
                    </span>
                  )}
                  {currentModeIndex === index && (
                    <span className="text-[10px] font-medium bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                {expanded
                  ? <HiChevronUp className="w-4 h-4 text-cd-subtle" />
                  : <HiChevronDown className="w-4 h-4 text-cd-subtle" />
                }
              </button>

              {/* Collapsed: show truncated prompt */}
              {!expanded && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-cd-subtle line-clamp-2">{prompt}</p>
                </div>
              )}

              {/* Expanded: full prompt editor */}
              {expanded && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Editable prompt */}
                  <textarea
                    value={prompt}
                    onChange={(e) => handleDirectEdit(index, e.target.value)}
                    className="w-full bg-cd-bg border border-white/10 rounded-xl p-3 text-sm text-cd-text placeholder-cd-subtle/50 resize-none focus:outline-none focus:ring-1 focus:ring-cd-accent/50 min-h-[100px]"
                  />

                  {/* Chat input for AI revision */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRevisePrompt(index)}
                      placeholder="What should I change?"
                      className="flex-1 bg-cd-bg border border-white/10 rounded-xl px-3 py-2 text-sm text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-1 focus:ring-cd-accent/50"
                    />
                    <button
                      onClick={() => handleRevisePrompt(index)}
                      disabled={!chatInput.trim() || isRevising}
                      className="px-3 py-2 rounded-xl bg-cd-accent text-white text-sm font-medium hover:bg-cd-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isRevising ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <HiPaperAirplane className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {reviseError && (
                    <p className="text-xs text-red-400">{reviseError}</p>
                  )}

                  {/* Reset button */}
                  {customized && (
                    <button
                      onClick={() => handleResetPrompt(index)}
                      className="flex items-center gap-1.5 text-xs text-cd-subtle hover:text-cd-text transition-colors"
                    >
                      <HiArrowPath className="w-3.5 h-3.5" />
                      Reset to Default
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
