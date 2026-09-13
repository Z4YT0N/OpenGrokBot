import { useEffect, useState } from 'react'
import type { Conversation, Routine, Team } from '../../../shared/types'
import { cronPresets, deleteRoutine, putRoutine, runRoutine } from '../api'
import { formatDuration, formatRelative } from '../format'
import { conversationTitle, personFor } from '../people'
import { Avatar } from './Avatar'

interface RoutinesProps {
  team: Team
  conversations: Conversation[]
  routines: Routine[]
}

function slug(): string {
  return `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export function Routines({ team, conversations, routines }: RoutinesProps) {
  const [editing, setEditing] = useState<Routine | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      await runRoutine(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }
  const remove = async (id: string) => {
    try {
      await deleteRoutine(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const toggle = async (r: Routine) => {
    try {
      await putRoutine(r.id, { name: r.name, agentId: r.agentId, conversationId: r.conversationId, cron: r.cron, instruction: r.instruction, enabled: !r.enabled })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="marketplace-head">
        <h1>Routines</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>
          + New routine
        </button>
      </div>
      <p className="lead">A routine makes one employee do a job on a schedule, or whenever something hits its webhook (Slack, GitHub, Zapier, a cron service). The result lands in the conversation you pick. Runs while this app is open.</p>
      {error && <div className="form-error">{error}</div>}
      <div className="card">
        {routines.length === 0 && (
          <div className="row">
            <div className="row-text">
              <div className="row-title">No routines yet</div>
              <div className="row-hint">Example: every weekday at 09:00, Karim posts the outreach list for the day. Or: when a GitHub webhook fires, Omar reviews the commit.</div>
            </div>
          </div>
        )}
        {routines.map((r) => {
          const p = personFor(team, r.agentId)
          const conv = conversations.find((c) => c.id === r.conversationId)
          const last = r.runs[0]
          return (
            <div key={r.id} className="row">
              <Avatar person={p} size={34} />
              <div className="row-text">
                <div className="row-title">
                  {r.name}
                  {!r.enabled && <span className="badge">paused</span>}
                </div>
                <div className="row-hint">
                  {p.name} → {conv ? conversationTitle(team, conv) : r.conversationId} · {r.cron ? `cron ${r.cron}` : 'webhook only'}
                  {r.nextRunAt ? ` · next ${formatRelative(r.nextRunAt)}` : ''}
                </div>
                <div className="row-hint">
                  {last ? `Last run ${formatRelative(last.at)}: ${last.status}${last.error ? ` (${last.error})` : ''} in ${formatDuration(last.durationMs)}` : 'Never ran'} · webhook <code>POST /api/hooks/{r.id}</code>
                </div>
              </div>
              <div className="row-control">
                <button type="button" className="btn" disabled={busy === r.id} onClick={() => void run(r.id)}>
                  {busy === r.id ? 'Running…' : 'Run now'}
                </button>
                <button type="button" className="btn" onClick={() => void toggle(r)}>
                  {r.enabled ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="btn" onClick={() => setEditing(r)}>
                  Edit
                </button>
                <button type="button" className="btn btn-danger-ghost" onClick={() => void remove(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {editing !== undefined && <RoutineSheet team={team} conversations={conversations} routine={editing} onDone={() => setEditing(undefined)} />}
    </>
  )
}

function RoutineSheet({ team, conversations, routine, onDone }: { team: Team; conversations: Conversation[]; routine: Routine | null; onDone: () => void }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [agentId, setAgentId] = useState(routine?.agentId ?? team.agents[0]?.id ?? '')
  const [conversationId, setConversationId] = useState(routine?.conversationId ?? (routine ? '' : `dm-${team.agents[0]?.id ?? ''}`))
  const [cron, setCron] = useState(routine?.cron ?? '0 9 * * 0-4')
  const [instruction, setInstruction] = useState(routine?.instruction ?? '')
  const [presets, setPresets] = useState<{ label: string; cron: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    cronPresets().then(setPresets).catch(() => setPresets([]))
  }, [])
  const eligible = conversations.filter((c) => c.memberIds.includes(agentId))
  useEffect(() => {
    if (!eligible.some((c) => c.id === conversationId)) setConversationId(eligible[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await putRoutine(routine?.id ?? slug(), { name: name.trim() || 'Routine', agentId, conversationId, cron: cron.trim(), instruction: instruction.trim(), enabled: routine?.enabled ?? true })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop nested" onMouseDown={(e) => e.target === e.currentTarget && onDone()}>
      <div className="modal sheet" role="dialog">
        <h2>{routine ? 'Edit routine' : 'New routine'}</h2>
        {error && <div className="form-error">{error}</div>}
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning outreach list" autoFocus />
        </label>
        <label className="field">
          <span>Employee</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {team.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} | {a.role}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Post the result in</span>
          <select value={conversationId} onChange={(e) => setConversationId(e.target.value)}>
            {eligible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'group' ? `Group · ${conversationTitle(team, c)}` : `DM · ${conversationTitle(team, c)}`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Schedule (cron, local time; leave empty for webhook-only)</span>
          <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 0-4" />
          <div className="chips">
            {presets.map((p) => (
              <button key={p.cron} type="button" className={`chip${cron === p.cron ? ' is-active' : ''}`} onClick={() => setCron(p.cron)}>
                {p.label}
              </button>
            ))}
            <button type="button" className={`chip${cron === '' ? ' is-active' : ''}`} onClick={() => setCron('')}>
              Webhook only
            </button>
          </div>
        </label>
        <label className="field">
          <span>Instruction</span>
          <textarea rows={5} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Pull today's leads from …, skip anyone already contacted, and post a ranked list with one line each. Do not send anything." />
          <small>Written like a message to that employee. Their tools, folder and personality apply as usual.</small>
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !instruction.trim() || !conversationId} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
