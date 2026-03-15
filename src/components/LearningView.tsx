import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { HiTrash, HiPencil, HiCheck, HiXMark, HiPlus, HiEye, HiEyeSlash, HiSparkles } from 'react-icons/hi2'
import { v4 as uuidv4 } from 'uuid'
import { DICTATION_MODES } from '../constants/modes'
import type { LearnedPattern } from '../types'

export default function LearningView() {
  const { learnedPatterns, saveLearnedPatternsToFile } = useAppStore()
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

  // Mode-based filter options (replacing old platform options)
  const modeOptions = [
    { id: 'all', name: 'All Modes' },
    ...DICTATION_MODES.map(m => ({ id: m.id, name: m.name })),
  ]

  const autoPatterns = filteredPatterns.filter(p => p.source === 'auto')
  const manualPatterns = filteredPatterns.filter(p => p.source === 'manual')

  // Get display name for a mode/platform ID
  const getModeName = (id: string): string => {
    if (id === 'all') return 'All'
    const mode = DICTATION_MODES.find(m => m.id === id)
    return mode?.name || id
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-cd-text">Learning History</h2>
          <p className="text-sm text-cd-subtle">
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

      {/* Add manual rule */}
      {showAddForm && (
        <div className="card slide-in">
          <h3 className="font-medium text-cd-text mb-3">Add Manual Rule</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-cd-subtle mb-1">Description</label>
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
              <label className="block text-xs font-medium text-cd-subtle mb-1">Rule</label>
              <input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="e.g., Capitalize proper nouns and brand names like React, TypeScript, Google"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-cd-subtle mb-1">Apply to mode</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                className="input-field text-sm"
              >
                {modeOptions.map(p => (
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
          <span className="text-xs text-cd-subtle">Filter:</span>
          {modeOptions.map(p => (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-all
                ${filter === p.id
                  ? 'bg-cd-accent/20 text-cd-accent font-medium'
                  : 'text-cd-subtle hover:bg-white/5'
                }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Training Records (patterns with before/after context) */}
      {autoPatterns.filter(p => p.originalText).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-cd-text mb-3 flex items-center gap-1.5">
            <HiSparkles className="w-4 h-4 text-amber-500" />
            Training Records ({autoPatterns.filter(p => p.originalText).length})
          </h3>
          <div className="divide-y divide-white/5">
            {autoPatterns.filter(p => p.originalText).map(pattern => (
              <div key={pattern.id} className={`py-3 group ${!pattern.active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        pattern.action === 'dictionary_add'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {pattern.action === 'dictionary_add' ? 'Dictionary' : 'Prompt Rule'}
                      </span>
                      <span className="text-[10px] bg-white/5 text-cd-subtle px-1.5 py-0.5 rounded">
                        {getModeName(pattern.platform)}
                      </span>
                      <span className="text-[10px] text-cd-subtle">
                        {new Date(pattern.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-cd-text">{pattern.description}</div>
                    <div className="text-xs text-cd-subtle mt-0.5 mb-2">{pattern.rule}</div>
                    {pattern.originalText && (
                      <div className="space-y-1">
                        <div className="text-xs">
                          <span className="text-red-400/70 font-medium">AI gave: </span>
                          <span className="text-cd-subtle">{pattern.originalText.length > 120 ? pattern.originalText.slice(0, 120) + '...' : pattern.originalText}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-green-400/70 font-medium">You wanted: </span>
                          <span className="text-cd-subtle">{pattern.correctedText && pattern.correctedText.length > 120 ? pattern.correctedText.slice(0, 120) + '...' : pattern.correctedText}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggleActive(pattern.id)} className="btn-icon" title={pattern.active ? 'Disable' : 'Enable'}>
                      {pattern.active ? <HiEye className="w-3.5 h-3.5" /> : <HiEyeSlash className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleDelete(pattern.id)} className="btn-icon text-red-400 hover:text-red-500">
                      <HiTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-learned patterns (without training context - legacy) */}
      {autoPatterns.filter(p => !p.originalText).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-cd-text mb-3 flex items-center gap-1.5">
            <HiSparkles className="w-4 h-4 text-amber-500" />
            Auto-Learned ({autoPatterns.filter(p => !p.originalText).length})
          </h3>
          <PatternList
            patterns={autoPatterns.filter(p => !p.originalText)}
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
            getModeName={getModeName}
          />
        </div>
      )}

      {/* Manual patterns */}
      {manualPatterns.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-cd-text mb-3">
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
            getModeName={getModeName}
          />
        </div>
      )}

      {/* Empty state */}
      {filteredPatterns.length === 0 && !showAddForm && (
        <div className="card text-center py-8 text-cd-subtle">
          <HiSparkles className="w-8 h-8 mx-auto mb-2 text-cd-subtle/50" />
          <p>No learned patterns yet.</p>
          <p className="text-xs mt-1">
            Edit your transcriptions before copying and Prattle will learn your preferences.
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
  getModeName
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
  getModeName: (id: string) => string
}) {
  return (
    <div className="divide-y divide-white/5">
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
                <button onClick={() => onEdit(pattern.id)} className="btn-icon text-green-400">
                  <HiCheck className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-cd-text">{pattern.description}</div>
                <div className="text-xs text-cd-subtle mt-0.5">{pattern.rule}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] bg-white/5 text-cd-subtle px-1.5 py-0.5 rounded">
                    {getModeName(pattern.platform)}
                  </span>
                  <span className="text-[10px] text-cd-subtle">
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
                <button onClick={() => onDelete(pattern.id)} className="btn-icon text-red-400 hover:text-red-500">
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
