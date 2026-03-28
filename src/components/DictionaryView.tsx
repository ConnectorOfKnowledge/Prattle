import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { HiPlus, HiTrash, HiPencil, HiCheck, HiXMark, HiMagnifyingGlass, HiArrowDownTray, HiArrowUpTray } from 'react-icons/hi2'

export default function DictionaryView() {
  const { dictionary, saveDictionaryToFile } = useAppStore()
  const [entries, setEntries] = useState<[string, string][]>([])
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (dictionary) {
      setEntries(Object.entries(dictionary.replacements).sort((a, b) => a[0].localeCompare(b[0])))
    }
  }, [dictionary])

  const filteredEntries = entries.filter(([from, to]) =>
    from.toLowerCase().includes(search.toLowerCase()) ||
    to.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async () => {
    if (!newFrom.trim() || !newTo.trim() || !dictionary) return

    const updated = {
      replacements: {
        ...dictionary.replacements,
        [newFrom.trim().toLowerCase()]: newTo.trim()
      }
    }
    await saveDictionaryToFile(updated)
    setNewFrom('')
    setNewTo('')
    setShowAddForm(false)
  }

  const handleDelete = async (key: string) => {
    if (!dictionary) return
    if (!window.confirm('Delete this dictionary entry?')) return
    const { [key]: _, ...rest } = dictionary.replacements
    await saveDictionaryToFile({ replacements: rest })
  }

  const handleEdit = async (oldKey: string) => {
    if (!editFrom.trim() || !editTo.trim() || !dictionary) return

    const newReplacements = { ...dictionary.replacements }
    delete newReplacements[oldKey]
    newReplacements[editFrom.trim().toLowerCase()] = editTo.trim()

    await saveDictionaryToFile({ replacements: newReplacements })
    setEditingKey(null)
  }

  const startEdit = (from: string, to: string) => {
    setEditingKey(from)
    setEditFrom(from)
    setEditTo(to)
  }

  const handleExport = async () => {
    if (!dictionary) return
    const result = await window.electronAPI.showSaveDialog({
      title: 'Export Dictionary',
      defaultPath: 'prattle-dictionary.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result?.filePath) {
      await window.electronAPI.writeFile(result.filePath, JSON.stringify(dictionary, null, 2))
    }
  }

  const handleImport = async () => {
    setError('')
    const result = await window.electronAPI.showOpenDialog({
      title: 'Import Dictionary',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result?.filePaths?.[0]) {
      try {
        const content = await window.electronAPI.readFile(result.filePaths[0])
        const imported = JSON.parse(content)
        if (imported.replacements && typeof imported.replacements === 'object') {
          const merged = {
            replacements: {
              ...(dictionary?.replacements || {}),
              ...imported.replacements
            }
          }
          await saveDictionaryToFile(merged)
        } else {
          setError('Failed to import dictionary. Make sure the file is valid JSON.')
        }
      } catch (err: unknown) {
        setError('Failed to import dictionary. Make sure the file is valid JSON.')
      }
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-cd-text">Dictionary</h2>
          <p className="text-sm text-cd-subtle">
            Word replacements applied before AI processing. {entries.length} entries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleImport} className="btn-icon" title="Import">
            <HiArrowDownTray className="w-5 h-5" />
          </button>
          <button onClick={handleExport} className="btn-icon" title="Export">
            <HiArrowUpTray className="w-5 h-5" />
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

      {/* Error display */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="card slide-in">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-cd-subtle mb-1">When I say...</label>
              <input
                type="text"
                value={newFrom}
                onChange={(e) => setNewFrom(e.target.value)}
                placeholder="e.g., gonna"
                className="input-field text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="text-cd-subtle pb-2.5">&rarr;</div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-cd-subtle mb-1">Replace with...</label>
              <input
                type="text"
                value={newTo}
                onChange={(e) => setNewTo(e.target.value)}
                placeholder="e.g., going to"
                className="input-field text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <button onClick={handleAdd} className="btn-primary text-sm px-4">
              Add
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      {entries.length > 5 && (
        <div className="relative">
          <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cd-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dictionary..."
            className="input-field pl-9 text-sm"
          />
        </div>
      )}

      {/* Entries list */}
      <div className="card">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-cd-subtle">
            {entries.length === 0
              ? 'No dictionary entries yet. Add words above.'
              : 'No matches found.'
            }
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredEntries.map(([from, to]) => (
              <div key={from} className="flex items-center gap-3 py-2.5 group">
                {editingKey === from ? (
                  <>
                    <input
                      type="text"
                      value={editFrom}
                      onChange={(e) => setEditFrom(e.target.value)}
                      className="input-field text-sm flex-1 py-1.5"
                      autoFocus
                    />
                    <span className="text-cd-subtle text-sm">&rarr;</span>
                    <input
                      type="text"
                      value={editTo}
                      onChange={(e) => setEditTo(e.target.value)}
                      className="input-field text-sm flex-1 py-1.5"
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit(from)}
                    />
                    <button onClick={() => handleEdit(from)} className="btn-icon text-green-400">
                      <HiCheck className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingKey(null)} className="btn-icon text-cd-subtle">
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-cd-text flex-1 font-medium">{from}</span>
                    <span className="text-cd-subtle text-sm">&rarr;</span>
                    <span className="text-sm text-cd-accent flex-1">{to}</span>
                    <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-1">
                      <button onClick={() => startEdit(from, to)} className="btn-icon">
                        <HiPencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(from)} className="btn-icon text-red-400 hover:text-red-500">
                        <HiTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
