import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { Ticket, Tickets } from '../types'
import { HiPlus, HiTrash, HiPencil, HiCheck, HiXMark, HiChevronDown, HiChevronUp, HiEnvelope } from 'react-icons/hi2'
import { v4 as uuidv4 } from 'uuid'

type StatusFilter = 'all' | 'open' | 'in-progress' | 'done'
type PriorityFilter = 'all' | 'low' | 'medium' | 'high'

const statusColors: Record<string, string> = {
  'open': 'bg-blue-100 text-blue-700',
  'in-progress': 'bg-amber-100 text-amber-700',
  'done': 'bg-green-100 text-green-700',
}

const priorityColors: Record<string, string> = {
  'low': 'bg-surface-200 text-gray-600',
  'medium': 'bg-orange-100 text-orange-700',
  'high': 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  'open': 'Open',
  'in-progress': 'In Progress',
  'done': 'Done',
}

const nextStatus: Record<string, Ticket['status']> = {
  'open': 'in-progress',
  'in-progress': 'done',
  'done': 'open',
}

export default function TicketsView() {
  const { tickets, saveTicketsToFile } = useAppStore()
  const [localTickets, setLocalTickets] = useState<Tickets>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState<Ticket['priority']>('medium')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState<Ticket['priority']>('medium')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)

  useEffect(() => {
    if (tickets) {
      setLocalTickets([...tickets])
    }
  }, [tickets])

  const saveTickets = async (updated: Tickets) => {
    setLocalTickets(updated)
    await saveTicketsToFile(updated)
  }

  const handleAdd = async () => {
    if (!newTitle.trim()) return

    const ticket: Ticket = {
      id: uuidv4(),
      title: newTitle.trim(),
      description: newDescription.trim(),
      priority: newPriority,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await saveTickets([...localTickets, ticket])
    setShowAddForm(false)
    setNewTitle('')
    setNewDescription('')
    setNewPriority('medium')
  }

  const handleStatusToggle = async (id: string) => {
    const updated = localTickets.map(t =>
      t.id === id
        ? { ...t, status: nextStatus[t.status], updatedAt: new Date().toISOString() }
        : t
    )
    await saveTickets(updated)
  }

  const handleDelete = async (id: string) => {
    const updated = localTickets.filter(t => t.id !== id)
    await saveTickets(updated)
    setConfirmDeleteId(null)
    if (expandedId === id) setExpandedId(null)
  }

  const startEdit = (ticket: Ticket) => {
    setEditingId(ticket.id)
    setEditTitle(ticket.title)
    setEditDescription(ticket.description)
    setEditPriority(ticket.priority)
    setExpandedId(ticket.id)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim()) return

    const updated = localTickets.map(t =>
      t.id === editingId
        ? {
            ...t,
            title: editTitle.trim(),
            description: editDescription.trim(),
            priority: editPriority,
            updatedAt: new Date().toISOString(),
          }
        : t
    )
    await saveTickets(updated)
    setEditingId(null)
  }

  const generateEmailReport = () => {
    if (!localTickets.length) return 'No tickets to report.'

    const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    const grouped = {
      open: localTickets.filter(t => t.status === 'open'),
      'in-progress': localTickets.filter(t => t.status === 'in-progress'),
      done: localTickets.filter(t => t.status === 'done'),
    }

    let report = `VOICETYPE — CHANGE RECOMMENDATIONS\nGenerated: ${now}\n`
    report += `Total: ${localTickets.length} tickets (${grouped.open.length} open, ${grouped['in-progress'].length} in progress, ${grouped.done.length} done)\n`

    const sections: [string, Ticket[]][] = [
      ['OPEN', grouped.open],
      ['IN PROGRESS', grouped['in-progress']],
      ['COMPLETED', grouped.done],
    ]

    for (const [label, tickets] of sections) {
      if (tickets.length === 0) continue
      report += `\n${'═'.repeat(40)}\n${label} (${tickets.length})\n${'═'.repeat(40)}\n\n`

      for (const ticket of tickets) {
        const priority = ticket.priority.toUpperCase()
        report += `● [${priority}] ${ticket.title}\n`
        report += `  Created: ${new Date(ticket.createdAt).toLocaleDateString()}`
        if (ticket.updatedAt !== ticket.createdAt) {
          report += ` | Updated: ${new Date(ticket.updatedAt).toLocaleDateString()}`
        }
        report += '\n'
        if (ticket.description) {
          report += `  ${ticket.description}\n`
        }
        report += '\n'
      }
    }

    return report.trim()
  }

  const handleCopyExport = async () => {
    const report = generateEmailReport()
    await navigator.clipboard.writeText(report)
    setExportCopied(true)
    setTimeout(() => setExportCopied(false), 2000)
  }

  // Filter tickets
  const filtered = localTickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    return true
  })

  // Sort: open first, then in-progress, then done. Within each status, high priority first.
  const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 }
  const statusOrder = { 'open': 0, 'in-progress': 1, 'done': 2 }
  const sorted = [...filtered].sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  const openCount = localTickets.filter(t => t.status === 'open').length
  const inProgressCount = localTickets.filter(t => t.status === 'in-progress').length
  const doneCount = localTickets.filter(t => t.status === 'done').length

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Tickets</h2>
          <p className="text-sm text-gray-500">
            Track feature requests and changes.
          </p>
        </div>
        <div className="flex gap-2">
          {localTickets.length > 0 && (
            <button
              onClick={() => setShowExport(!showExport)}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl font-medium transition-colors ${
                showExport
                  ? 'bg-indigo-500 text-white'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              }`}
            >
              <HiEnvelope className="w-4 h-4" />
              Email Report
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <HiPlus className="w-4 h-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <span className="text-gray-500">{openCount} Open</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span className="text-gray-500">{inProgressCount} In Progress</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          <span className="text-gray-500">{doneCount} Done</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Status:</span>
          {(['all', 'open', 'in-progress', 'done'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                statusFilter === s
                  ? 'bg-primary-100 text-primary-700 font-medium'
                  : 'bg-surface-100 text-gray-500 hover:bg-surface-200'
              }`}
            >
              {s === 'all' ? 'All' : statusLabels[s] || s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Priority:</span>
          {(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map(p => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors capitalize ${
                priorityFilter === p
                  ? 'bg-primary-100 text-primary-700 font-medium'
                  : 'bg-surface-100 text-gray-500 hover:bg-surface-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Email export panel */}
      {showExport && (
        <div className="card slide-in border-2 border-indigo-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-700">Email Report</h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopyExport}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  exportCopied
                    ? 'bg-green-500 text-white'
                    : 'bg-primary-500 text-white hover:bg-primary-600'
                }`}
              >
                {exportCopied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button onClick={() => setShowExport(false)} className="btn-icon">
                <HiXMark className="w-4 h-4" />
              </button>
            </div>
          </div>
          <pre className="text-xs text-gray-600 bg-surface-50 p-3 rounded-lg whitespace-pre-wrap font-mono max-h-80 overflow-y-auto leading-relaxed">
            {generateEmailReport()}
          </pre>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="card slide-in border-2 border-primary-200">
          <h3 className="font-medium text-gray-700 mb-3">New Ticket</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Brief description of the change..."
                className="input-field text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="More details about what you want..."
                className="textarea-field text-sm min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      newPriority === p
                        ? priorityColors[p]
                        : 'bg-surface-100 text-gray-400 hover:bg-surface-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={handleAdd} className="btn-primary text-sm" disabled={!newTitle.trim()}>
                Add Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No tickets yet.</p>
          <p className="text-xs mt-1">Click "New Ticket" to add your first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(ticket => (
            <div key={ticket.id} className={`card transition-all ${ticket.status === 'done' ? 'opacity-60' : ''}`}>
              {editingId === ticket.id ? (
                // Edit mode
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="input-field text-sm font-medium"
                    autoFocus
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="textarea-field text-sm min-h-[60px]"
                    placeholder="Description..."
                  />
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setEditPriority(p)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                          editPriority === p ? priorityColors[p] : 'bg-surface-100 text-gray-400'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="btn-icon">
                      <HiXMark className="w-4 h-4" />
                    </button>
                    <button onClick={handleSaveEdit} className="btn-primary text-xs">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                // Display mode
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${ticket.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {ticket.title}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[ticket.status]}`}>
                          {statusLabels[ticket.status]}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${priorityColors[ticket.priority]}`}>
                          {ticket.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                        {ticket.updatedAt !== ticket.createdAt && (
                          <> &middot; updated {new Date(ticket.updatedAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => handleStatusToggle(ticket.id)}
                        className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${
                          ticket.status === 'done'
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                        }`}
                        title={`Move to ${statusLabels[nextStatus[ticket.status]]}`}
                      >
                        {ticket.status === 'done' ? 'Reopen' : ticket.status === 'open' ? 'Start' : 'Complete'}
                      </button>
                      <button onClick={() => startEdit(ticket)} className="btn-icon">
                        <HiPencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === ticket.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(ticket.id)} className="text-[10px] px-2 py-1 bg-red-500 text-white rounded-lg">
                            Yes
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] px-2 py-1 bg-surface-200 text-gray-600 rounded-lg">
                            No
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(ticket.id)} className="btn-icon text-red-400 hover:text-red-600">
                          <HiTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                        className="btn-icon"
                      >
                        {expandedId === ticket.id ? <HiChevronUp className="w-3.5 h-3.5" /> : <HiChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedId === ticket.id && ticket.description && (
                    <div className="mt-2 pt-2 border-t border-surface-100">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{ticket.description}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
