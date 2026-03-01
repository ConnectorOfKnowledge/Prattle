import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { HiTrash, HiPencil, HiCheck, HiXMark, HiPlus, HiEye, HiEyeSlash, HiSparkles } from 'react-icons/hi2'
import { v4 as uuidv4 } from 'uuid'
import type { LearnedPattern } from '../types'

export default function LearningView() {
  const { learnedPatterns, saveLearnedPatternsToFile, platformPrompts, settings } = useAppStore()
  const [patterns, setPatterns] = useState<LearnedPattern[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editRule, setEditRule] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newRule, setNewRule] = useState('')
  const [newPlatform, setNewPlatform] = useState('all')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (learnedPatterns) {
      setPatterns(learnedPatterns.patterns)
    }
  }, [learnedPatterns])

  const filteredPatterns = patterns.filter(p =>
    filter === 'all' || p.platform === filter || p.platform === 'all'
  )

  const handleToggleActive = async (id: string) => {
    const updated = patterns.map(p =>
      p.id === id ? { ...p, active: !p.active } : p
    )
    await saveLearnedPatternsToFile({ patterns: updated })
  }

  const handleDelete = async (id: string) => {
    const updated = patterns.filter(p => p.id !== id)
    await saveLearnedPatternsToFile({ patterns: updated })
  }

  const handleEdit = async (id: string) => {
    if (!editDesc.trim() || !editRule.trim()) return
    const updated = patterns.map(p =>
      p.id === id ? { ...p, description: editDesc, rule: editRule } : p
    )
    await saveLearnedPatternsToFile({ patterns: updated })
    setEditingId(null)
  }

  const startEdit = (pattern: LearnedPattern) => {
    setEditingId(pattern.id)
    setEditDesc(pattern.description)
    setEditRule(pattern.rule)
  }

  const handleAdd = async () => {
    if (!newDesc.trim() || !newRule.trim()) return

    const newPattern: LearnedPattern = {
      id: uuidv4(),
      description: newDesc.trim(),
      rule: newRule.trim(),
      platform: newPlatform,
      createdAt: new Date().toISOString(),
      source: 'manual',
      active: true,
    }

    const updated = [...patterns, newPattern]
    await saveLearnedPatternsToFile({ patterns: updated })
    setNewDesc('')
    setNewRule('')
    setShowAddForm(false)
  }

  const handleClearAll = async () => {
    await saveLearnedPatternsToFile({ patterns: [] })
  }

  const platformOptions = [
    { id: 'all', name: 'All Platforms' },
    ...(platformPrompts
      ? Object.entries(platformPrompts)
          .filter(([_, p]) => p.enabled)
          .map(([id, p]) => ({ id, name: p.name }))
      : [])
  ]

  const autoPatterns = filteredPatterns.filter(p => p.source === 'auto')
  const manualPatterns = filteredPatterns.filter(p => p.source === 'manual')

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Learning History</h2>
          <p className="text-sm text-gray-500">
            Patterns learned from your edits. {patterns.length} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {patterns.length > 0 && (
            <button onClick={handleClearAll} className="btn-danger text-sm">
              Clear All
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <HiPlus className="w-4 h-4" />
            Add Rule
          </button>
        </div>
      </div>

      {/* Learning mode status */}
      <div className={`rounded-xl px-4 py-3 border ${settings?.learningMode ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiSparkles className={`w-4 h-4 ${settings?.learningMode ? 'text-green-600' : 'text-amber-600'}`} />
            <span className={`text-sm font-medium ${settings?.learningMode ? 'text-green-800' : 'text-amber-800'}`}>
              Learning Mode: {settings?.learningMode ? 'ON' : 'OFF'}
            </span>
          </div>
          {!settings?.learningMode && (
            <span className="text-xs text-amber-600">Enable in Settings → Preferences</span>
          )}
        </div>
        <p className="text-xs mt-1.5" style={{ color: settings?.learningMode ? '#15803d' : '#92400e' }}>
          {settings?.learningMode
            ? 'VoiceType is actively learning from your edits. Word corrections are auto-added to your dictionary, and patterns are extracted for future use.'
            : 'When enabled, VoiceType will learn word corrections from your edits and auto-add them to your dictionary.'
          }
        </p>
      </div>

      {/* Add manual rule */}
      {showAddForm && (
        <div className="card slide-in">
          <h3 className="font-medium text-gray-700 mb-3">Add Manual Rule</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="e.g., Always capitalize brand names"
                className="input-field text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rule</label>
              <input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="e.g., Capitalize proper nouns and brand names like React, TypeScript, Google"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Apply to platform</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                className="input-field text-sm"
              >
                {platformOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={handleAdd} className="btn-primary text-sm">
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      {patterns.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Filter:</span>
          {platformOptions.map(p => (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-all
                ${filter === p.id
                  ? 'bg-primary-100 text-primary-700 font-medium'
                  : 'text-gray-500 hover:bg-surface-100'
                }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Auto-learned patterns */}
      {autoPatterns.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-1.5">
            <HiSparkles className="w-4 h-4 text-amber-500" />
            Auto-Learned ({autoPatterns.length})
          </h3>
          <PatternList
            patterns={autoPatterns}
            editingId={editingId}
            editDesc={editDesc}
            editRule={editRule}
            setEditDesc={setEditDesc}
            setEditRule={setEditRule}
            onToggle={handleToggleActive}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onStartEdit={startEdit}
            onCancelEdit={() => setEditingId(null)}
            platformPrompts={platformPrompts}
          />
        </div>
      )}

      {/* Manual patterns */}
      {manualPatterns.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-3">
            Manual Rules ({manualPatterns.length})
          </h3>
          <PatternList
            patterns={manualPatterns}
            editingId={editingId}
            editDesc={editDesc}
            editRule={editRule}
            setEditDesc={setEditDesc}
            setEditRule={setEditRule}
            onToggle={handleToggleActive}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onStartEdit={startEdit}
            onCancelEdit={() => setEditingId(null)}
            platformPrompts={platformPrompts}
          />
        </div>
      )}

      {/* Empty state */}
      {filteredPatterns.length === 0 && !showAddForm && (
        <div className="card text-center py-8 text-gray-400">
          <HiSparkles className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No learned patterns yet.</p>
          <p className="text-xs mt-1">
            Edit your transcriptions before copying and VoiceType will learn your preferences.
          </p>
        </div>
      )}
    </div>
  )
}

// Pattern list subcomponent
function PatternList({
  patterns, editingId, editDesc, editRule,
  setEditDesc, setEditRule,
  onToggle, onDelete, onEdit, onStartEdit, onCancelEdit,
  platformPrompts
}: {
  patterns: LearnedPattern[]
  editingId: string | null
  editDesc: string
  editRule: string
  setEditDesc: (v: string) => void
  setEditRule: (v: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  onStartEdit: (p: LearnedPattern) => void
  onCancelEdit: () => void
  platformPrompts: any
}) {
  return (
    <div className="divide-y divide-surface-200">
      {patterns.map(pattern => (
        <div key={pattern.id} className={`py-3 group ${!pattern.active ? 'opacity-50' : ''}`}>
          {editingId === pattern.id ? (
            <div className="space-y-2">
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="input-field text-sm"
                placeholder="Description"
                autoFocus
              />
              <input
                value={editRule}
                onChange={(e) => setEditRule(e.target.value)}
                className="input-field text-sm"
                placeholder="Rule"
              />
              <div className="flex justify-end gap-2">
                <button onClick={onCancelEdit} className="btn-icon">
                  <HiXMark className="w-4 h-4" />
                </button>
                <button onClick={() => onEdit(pattern.id)} className="btn-icon text-green-600">
                  <HiCheck className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700">{pattern.description}</div>
                <div className="text-xs text-gray-500 mt-0.5">{pattern.rule}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] bg-surface-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {pattern.platform === 'all' ? 'All' : platformPrompts?.[pattern.platform]?.name || pattern.platform}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(pattern.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                <button onClick={() => onToggle(pattern.id)} className="btn-icon" title={pattern.active ? 'Disable' : 'Enable'}>
                  {pattern.active ? <HiEye className="w-3.5 h-3.5" /> : <HiEyeSlash className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => onStartEdit(pattern)} className="btn-icon">
                  <HiPencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(pattern.id)} className="btn-icon text-red-400 hover:text-red-600">
                  <HiTrash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
