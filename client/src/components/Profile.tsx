import { useEffect, useState } from 'react'
import { EFFORTS, MODELS, PERMISSION_MODES, SHAPES, TOOLS } from '../../../shared/catalog'
import type { Agent, AvatarShape, Effort, PermissionMode, Team, UsageTotals } from '../../../shared/types'
import { createAgent, deleteAgent, updateAgent } from '../api'
import { formatCost, formatTokens } from '../format'
import { personFor } from '../people'
import { Avatar } from './Avatar'

interface ProfileProps {
  team: Team
  /** Existing employee id, or null to create a new one. */
  agentId: string | null
  usage?: UsageTotals
  onClose: () => void
  onSaved: (id: string) => void
}

const PALETTE = ['#2f7ef5', '#ff6a1a', '#1e90ff', '#e6396b', '#e63946', '#b5733c', '#8b5cf6', '#c98a4b', '#22c55e', '#7c4dff', '#14b8a6', '#f59e0b', '#ec4899', '#64748b']

function blank(team: Team): Agent {
  return {
    id: '',
    name: '',
    role: '',
    color: PALETTE[team.agents.length % PALETTE.length] ?? '#2f7ef5',
    shape: 'blob',
    model: 'claude-opus-5',
    effort: 'medium',
    personality: '',
    tools: [],
    permissionMode: 'dontAsk',
    mcpServers: [],
    inheritClaudeSettings: false,
    autoApproveTools: false,
  }
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function Profile({ team, agentId, usage, onClose, onSaved }: ProfileProps) {
  const existing = agentId ? team.agents.find((a) => a.id === agentId) : undefined
  const [draft, setDraft] = useState<Agent>(existing ?? blank(team))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setDraft(existing ?? blank(team))
    setError(null)
    setConfirmDelete(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const set = <K extends keyof Agent>(key: K, value: Agent[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const toggleList = (key: 'tools' | 'mcpServers', item: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(item) ? d[key].filter((x) => x !== item) : [...d[key], item] }))

  const preview = personFor({ ...team, agents: [...team.agents.filter((a) => a.id !== draft.id), { ...draft, id: draft.id || 'new' }] }, draft.id || 'new')
  const dirty = JSON.stringify(draft) !== JSON.stringify(existing ?? blank(team))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const body: Agent = { ...draft, name: draft.name.trim().toUpperCase(), role: draft.role.trim().toUpperCase() }
      if (existing) {
        const { id: _id, ...patch } = body
        await updateAgent(existing.id, patch)
        onSaved(existing.id)
      } else {
        const id = slug(body.name)
        if (!id) throw new Error('Give the employee a name first.')
        await createAgent({ ...body, id })
        onSaved(id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    setSaving(true)
    try {
      await deleteAgent(existing.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <aside className="profile">
      <header className="profile-header">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12.5 4.5L7 10l5.5 5.5" />
          </svg>
        </button>
        <h2>{existing ? 'Edit profile' : 'New employee'}</h2>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>
      <div className="profile-body">
        <div className="profile-hero">
          <Avatar person={preview} size={72} />
          <div className="profile-hero-name">{draft.name || 'NAME'} | {draft.role || 'ROLE'}</div>
          {usage && usage.messages > 0 && (
            <div className="profile-hero-meta">
              {usage.messages} msgs · {formatTokens(usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens)} in · {formatTokens(usage.outputTokens)} out · {formatCost(usage.costUsd)}
            </div>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <section className="form-section">
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="OMAR" />
          </label>
          <label className="field">
            <span>Role</span>
            <input value={draft.role} onChange={(e) => set('role', e.target.value)} placeholder="FULL STACK DEV" />
          </label>
          <label className="field">
            <span>Label (optional)</span>
            <input value={draft.department ?? ''} onChange={(e) => set('department', e.target.value || undefined)} placeholder="Engineering" />
          </label>
          <div className="field">
            <span>Look</span>
            <div className="swatches">
              {PALETTE.map((c) => (
                <button key={c} type="button" className={`swatch${draft.color === c ? ' is-active' : ''}`} style={{ background: c }} onClick={() => set('color', c)} aria-label={c} />
              ))}
            </div>
            <div className="shapes">
              {SHAPES.map((s) => (
                <button key={s} type="button" className={`shape${draft.shape === s ? ' is-active' : ''}`} onClick={() => set('shape', s as AvatarShape)} aria-label={s}>
                  <Avatar person={{ ...preview, agent: { ...draft, shape: s as AvatarShape } }} size={30} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="form-section">
          <h3>Brain</h3>
          <label className="field">
            <span>Model</span>
            <select value={MODELS.some((m) => m.id === draft.model) ? draft.model : 'custom'} onChange={(e) => set('model', e.target.value === 'custom' ? draft.model : e.target.value)}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="custom">Custom id…</option>
            </select>
            {!MODELS.some((m) => m.id === draft.model) && <input value={draft.model} onChange={(e) => set('model', e.target.value)} placeholder="claude-…" />}
            <small>{MODELS.find((m) => m.id === draft.model)?.hint ?? 'Any model id Claude Code accepts.'}</small>
          </label>
          <label className="field">
            <span>Effort</span>
            <div className="segmented">
              {EFFORTS.map((e) => (
                <button key={e.id} type="button" className={draft.effort === e.id ? 'is-active' : ''} onClick={() => set('effort', e.id as Effort)}>
                  {e.label}
                </button>
              ))}
            </div>
            <small>How hard the model thinks per reply. Low is fast and cheap on your limits; max is for the hardest work.</small>
          </label>
          <label className="field">
            <span>Personality</span>
            <textarea rows={7} value={draft.personality} onChange={(e) => set('personality', e.target.value)} placeholder="You are …" />
          </label>
        </section>

        <section className="form-section">
          <h3>Tools</h3>
          <div className="checks">
            {TOOLS.map((t) => (
              <label key={t.id} className="check" title={t.hint}>
                <input type="checkbox" checked={draft.tools.includes(t.id)} onChange={() => toggleList('tools', t.id)} />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span>Permissions</span>
            <select value={draft.permissionMode} onChange={(e) => set('permissionMode', e.target.value as PermissionMode)}>
              {PERMISSION_MODES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <small>{PERMISSION_MODES.find((p) => p.id === draft.permissionMode)?.hint}</small>
          </label>
          <label className="field">
            <span>Working folder</span>
            <input value={draft.cwd ?? ''} onChange={(e) => set('cwd', e.target.value || undefined)} placeholder={team.workspace} />
          </label>
        </section>

        <section className="form-section">
          <h3>MCP servers</h3>
          {Object.keys(team.mcpServers).length === 0 ? (
            <p className="hint">None configured yet. Add some from Settings → Marketplace.</p>
          ) : (
            <div className="checks">
              {Object.keys(team.mcpServers).map((name) => (
                <label key={name} className="check">
                  <input type="checkbox" checked={draft.mcpServers.includes(name)} onChange={() => toggleList('mcpServers', name)} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          )}
          <label className="toggle-row">
            <div>
              <div className="toggle-title">Use my Claude Code setup</div>
              <div className="toggle-hint">Loads your own user settings: MCP servers, plugins, skills and CLAUDE.md from ~/.claude.</div>
            </div>
            <input type="checkbox" className="toggle" checked={draft.inheritClaudeSettings} onChange={(e) => set('inheritClaudeSettings', e.target.checked)} />
          </label>
          <label className="toggle-row">
            <div>
              <div className="toggle-title">Auto-approve every tool</div>
              <div className="toggle-hint">Never block on permission prompts, including MCP tools. Combine with a scoped working folder.</div>
            </div>
            <input type="checkbox" className="toggle" checked={draft.autoApproveTools} onChange={(e) => set('autoApproveTools', e.target.checked)} />
          </label>
        </section>

        {existing && (
          <section className="form-section danger">
            {confirmDelete ? (
              <div className="confirm">
                <span>Remove {existing.name} and their DM from the sidebar?</span>
                <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={saving}>
                  Delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmDelete(true)}>
                Delete employee
              </button>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
