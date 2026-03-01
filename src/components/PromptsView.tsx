import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { PlatformPrompts } from '../types'
import { HiPencil, HiCheck, HiXMark, HiEye, HiEyeSlash, HiPlus, HiTrash, HiArrowPath, HiSparkles } from 'react-icons/hi2'
import ChatPanel from './ChatPanel'

// Default prompts for reset functionality
const DEFAULT_PROMPTS: PlatformPrompts = {
  'ai-chat': {
    name: 'AI Chat',
    icon: 'robot',
    prompt: 'Clean up this dictated text for use in an AI chat conversation. Keep it natural and conversational but clear. Fix grammar, remove filler words, and make the intent clear. Do not add any extra commentary - return ONLY the cleaned text.',
    enabled: true,
  },
  'text-message': {
    name: 'Text Message',
    icon: 'phone',
    prompt: 'Clean up this dictated text for a text message. Keep it casual, brief, and natural. Use common texting conventions but keep it readable. Remove filler words. Do not add any extra commentary - return ONLY the cleaned text.',
    enabled: true,
  },
  'professional-email': {
    name: 'Professional Email',
    icon: 'briefcase',
    prompt: 'Clean up this dictated text for a professional email. Make it polished, clear, and professional in tone. Use proper grammar and formatting. Remove filler words and verbal tics. Do not add any extra commentary - return ONLY the cleaned text.',
    enabled: true,
  },
  'personal-email': {
    name: 'Personal Email',
    icon: 'envelope',
    prompt: 'Clean up this dictated text for a personal email. Keep it warm and friendly but well-written. Fix grammar and remove filler words while preserving the personal tone. Do not add any extra commentary - return ONLY the cleaned text.',
    enabled: true,
  },
  'tiktok': {
    name: 'TikTok',
    icon: 'share',
    prompt: 'Refine this dictated text into a TikTok-appropriate caption or script. Use a punchy hook and concise phrasing. Remove verbal fillers while keeping the energy high and the voice authentic. Return ONLY the cleaned text.',
    enabled: true,
  },
  'brain-dump': {
    name: 'Brain Dump',
    icon: 'clipboard',
    prompt: 'Process this dictated Brain Dump into a coherent, organized concept. Synthesize rambling thoughts into a logical flow. Remove all conversational artifacts and filler. Return ONLY the synthesized text.',
    enabled: true,
  },
  'raw': {
    name: 'Raw (No Processing)',
    icon: 'type',
    prompt: '',
    enabled: true,
  },
}

export default function PromptsView() {
  const { platformPrompts, savePlatformPromptsToFile, settings, saveSettingsToFile } = useAppStore()
  const [localPrompts, setLocalPrompts] = useState<PlatformPrompts>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [saved, setSaved] = useState(false)
  const [globalRules, setGlobalRules] = useState('')
  const [globalRulesSaved, setGlobalRulesSaved] = useState(false)

  // Chat panel state for prompt modification
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPlatformId, setChatPlatformId] = useState<string | null>(null)

  useEffect(() => {
    if (platformPrompts) {
      setLocalPrompts({ ...platformPrompts })
    }
  }, [platformPrompts])

  useEffect(() => {
    if (settings?.globalRules !== undefined) {
      setGlobalRules(settings.globalRules)
    }
  }, [settings])

  const handleSaveGlobalRules = async () => {
    if (!settings) return
    const updated = { ...settings, globalRules: globalRules.trim() }
    await saveSettingsToFile(updated)
    setGlobalRulesSaved(true)
    setTimeout(() => setGlobalRulesSaved(false), 2000)
  }

  const handleToggleEnabled = async (id: string) => {
    const updated = {
      ...localPrompts,
      [id]: { ...localPrompts[id], enabled: !localPrompts[id].enabled }
    }
    setLocalPrompts(updated)
    await savePlatformPromptsToFile(updated)
  }

  const startEdit = (id: string) => {
    setEditingId(id)
    setEditName(localPrompts[id].name)
    setEditPrompt(localPrompts[id].prompt)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return

    const updated = {
      ...localPrompts,
      [editingId]: {
        ...localPrompts[editingId],
        name: editName.trim(),
        prompt: editPrompt.trim(),
      }
    }
    setLocalPrompts(updated)
    await savePlatformPromptsToFile(updated)
    setEditingId(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDelete = async (id: string) => {
    const { [id]: _, ...rest } = localPrompts
    setLocalPrompts(rest)
    await savePlatformPromptsToFile(rest)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return

    const id = newId.trim() || newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    const updated = {
      ...localPrompts,
      [id]: {
        name: newName.trim(),
        icon: 'custom',
        prompt: newPrompt.trim(),
        enabled: true,
      }
    }
    setLocalPrompts(updated)
    await savePlatformPromptsToFile(updated)
    setShowAddForm(false)
    setNewId('')
    setNewName('')
    setNewPrompt('')
  }

  const handleResetToDefaults = async () => {
    setLocalPrompts(DEFAULT_PROMPTS)
    await savePlatformPromptsToFile(DEFAULT_PROMPTS)
  }

  const openChatForPlatform = (id: string) => {
    setChatPlatformId(id)
    setChatOpen(true)
  }

  const handleChatApply = async (newText: string) => {
    if (!chatPlatformId) return
    const updated = {
      ...localPrompts,
      [chatPlatformId]: {
        ...localPrompts[chatPlatformId],
        prompt: newText.trim(),
      }
    }
    setLocalPrompts(updated)
    await savePlatformPromptsToFile(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 p-4 max-w-2xl mx-auto space-y-4 slide-in overflow-y-auto ${chatOpen ? 'mr-0' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Platform Prompts</h2>
            <p className="text-sm text-gray-500">
              Customize how AI processes your text for each platform.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleResetToDefaults} className="btn-secondary text-sm flex items-center gap-1.5">
              <HiArrowPath className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <HiPlus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        {/* Global Rules */}
        <div className="card border-2 border-dashed border-surface-300">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-700">Global Rules</h3>
            {globalRulesSaved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <HiCheck className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Rules applied to ALL platforms (e.g., "never use M-dashes", "always use Oxford comma").
          </p>
          <textarea
            value={globalRules}
            onChange={(e) => setGlobalRules(e.target.value)}
            placeholder="Enter rules that apply to every platform..."
            className="textarea-field text-sm min-h-[80px] font-mono"
          />
          <div className="flex justify-end mt-2">
            <button onClick={handleSaveGlobalRules} className="btn-primary text-sm">
              Save Rules
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="card slide-in">
            <h3 className="font-medium text-gray-700 mb-3">New Platform</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Platform Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Slack Message"
                  className="input-field text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Processing Prompt</label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Instructions for the AI on how to process text for this platform..."
                  className="textarea-field text-sm min-h-[100px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button onClick={handleAdd} className="btn-primary text-sm">
                  Add Platform
                </button>
              </div>
            </div>
          </div>
        )}

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700 text-center">
            Saved!
          </div>
        )}

        {/* Platform list */}
        <div className="space-y-3">
          {Object.entries(localPrompts).map(([id, platform]) => (
            <div key={id} className="card">
              {editingId === id ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input-field text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Processing Prompt
                      {id === 'raw' && <span className="text-gray-400 ml-1">(leave empty for no processing)</span>}
                    </label>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      className="textarea-field text-sm min-h-[120px] font-mono"
                      placeholder="Instructions for the AI..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="btn-icon">
                      <HiXMark className="w-5 h-5" />
                    </button>
                    <button onClick={handleSaveEdit} className="btn-primary text-sm">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-medium ${platform.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                        {platform.name}
                      </h3>
                      {!platform.enabled && (
                        <span className="text-[10px] bg-surface-200 text-gray-500 px-1.5 py-0.5 rounded">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {platform.prompt || 'No processing (raw transcription)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    {platform.prompt && (
                      <button
                        onClick={() => openChatForPlatform(id)}
                        className="btn-icon text-purple-400 hover:text-purple-600"
                        title="Modify with AI"
                      >
                        <HiSparkles className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleToggleEnabled(id)} className="btn-icon" title={platform.enabled ? 'Disable' : 'Enable'}>
                      {platform.enabled ? <HiEye className="w-4 h-4" /> : <HiEyeSlash className="w-4 h-4" />}
                    </button>
                    <button onClick={() => startEdit(id)} className="btn-icon">
                      <HiPencil className="w-4 h-4" />
                    </button>
                    {!DEFAULT_PROMPTS[id] && (
                      <button onClick={() => handleDelete(id)} className="btn-icon text-red-400 hover:text-red-600">
                        <HiTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat panel for prompt modification */}
      {chatOpen && chatPlatformId && settings && (
        <ChatPanel
          contextText={localPrompts[chatPlatformId]?.prompt || ''}
          contextLabel={`Prompt for "${localPrompts[chatPlatformId]?.name}"`}
          systemInstruction={`You are helping the user improve their AI prompt template for the "${localPrompts[chatPlatformId]?.name}" platform. The current prompt is shown below. Help them refine it for better results. When you suggest a new version of the prompt, wrap it in <modified> tags so it can be extracted and applied. Always provide the COMPLETE modified prompt, not just the changes.\n\nCurrent prompt:\n${localPrompts[chatPlatformId]?.prompt}`}
          onApply={handleChatApply}
          onClose={() => {
            setChatOpen(false)
            setChatPlatformId(null)
          }}
          settings={settings}
        />
      )}
    </div>
  )
}
