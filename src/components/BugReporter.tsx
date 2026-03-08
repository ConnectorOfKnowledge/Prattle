import { useState } from 'react'
import { HiBugAnt, HiXMark } from 'react-icons/hi2'
import { createClient } from '@supabase/supabase-js'

// Shared Supabase project (TicketDeck) — public anon key, safe to embed
const TICKETS_URL = 'https://dgnikbbugiuuwokwenlm.supabase.co'
const TICKETS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbmlrYmJ1Z2l1dXdva3dlbmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NjQ1NTYsImV4cCI6MjA4ODE0MDU1Nn0.CHnKyacly6oFjSpcdXNEdUJ2eyt0u8JfS1BBh-WmED8'

const ticketsDb = createClient(TICKETS_URL, TICKETS_KEY)

interface BugReporterProps {
  appVersion: string
  currentView: string
}

export default function BugReporter({ appVersion, currentView }: BugReporterProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'bug' | 'ui_ux' | 'feature' | 'performance' | 'other'>('bug')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setTitle('')
    setDescription('')
    setType('bug')
    setPriority('medium')
    setError('')
    setSubmitted(false)
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setSubmitting(true)
    setError('')

    const context = `\n\n---\nApp: Prattle v${appVersion}\nView: ${currentView}\nOS: ${navigator.platform}\nTime: ${new Date().toISOString()}`

    const { error: insertError } = await ticketsDb
      .from('tickets')
      .insert({
        project: 'Prattle',
        type,
        priority,
        title: title.trim(),
        description: (description.trim() || '(No description)') + context,
        status: 'open',
        tags: [`v${appVersion}`],
      })

    setSubmitting(false)

    if (insertError) {
      setError('Failed to submit. Check your internet connection.')
      return
    }

    setSubmitted(true)
    setTimeout(() => {
      setOpen(false)
      reset()
    }, 1500)
  }

  return (
    <>
      {/* Floating bug icon */}
      <button
        onClick={() => { setOpen(true); reset() }}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-cd-card border border-white/10 flex items-center justify-center text-cd-subtle hover:text-cd-accent hover:border-cd-accent/50 transition-all shadow-lg"
        title="Report a bug"
      >
        <HiBugAnt className="w-5 h-5" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-cd-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl slide-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <HiBugAnt className="w-5 h-5 text-cd-accent" />
                <h3 className="font-medium text-cd-text">Report an Issue</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-cd-subtle hover:text-cd-text transition-colors"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-3">
              {submitted ? (
                <div className="text-center py-6">
                  <div className="text-green-400 text-lg font-medium mb-1">Submitted!</div>
                  <p className="text-cd-subtle text-sm">Thanks for the report.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-cd-subtle mb-1">Title *</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Brief summary of the issue"
                      className="w-full px-3 py-2 rounded-xl border border-white/10 bg-cd-bg text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-cd-subtle mb-1">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What happened? What did you expect?"
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border border-white/10 bg-cd-bg text-cd-text placeholder-cd-subtle/50 focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm resize-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-cd-subtle mb-1">Type</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as typeof type)}
                        className="w-full px-3 py-2 rounded-xl border border-white/10 bg-cd-bg text-cd-text focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
                      >
                        <option value="bug">Bug</option>
                        <option value="ui_ux">UI/UX</option>
                        <option value="feature">Feature Request</option>
                        <option value="performance">Performance</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-cd-subtle mb-1">Priority</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as typeof priority)}
                        className="w-full px-3 py-2 rounded-xl border border-white/10 bg-cd-bg text-cd-text focus:outline-none focus:ring-2 focus:ring-cd-accent/50 text-sm"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs text-red-400">{error}</p>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full py-2.5 rounded-xl font-medium text-sm bg-cd-accent hover:bg-cd-accent/80 text-white transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
