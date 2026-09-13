import { useEffect, useState } from 'react'
import { API_PRESETS, PROVIDER_KINDS } from '../../../shared/catalog'
import type { ProviderDef, ProviderStatus, Team } from '../../../shared/types'
import { deleteProvider, providerStatuses, putProvider } from '../api'

interface ProvidersProps {
  team: Team
}

const BUILT_IN = ['claude', 'codex', 'gemini']

export function Providers({ team }: ProvidersProps) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([])
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const refresh = async (force = false) => {
    setChecking(true)
    try {
      setStatuses(await providerStatuses(force))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [team.providers])

  const remove = async (id: string) => {
    setError(null)
    try {
      await deleteProvider(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const usersOf = (id: string) => team.agents.filter((a) => a.provider === id).map((a) => a.name)
  const statusOf = (id: string) => statuses.find((s) => s.id === id)

  return (
    <>
      <div className="marketplace-head">
        <h1>Providers</h1>
        <div className="row-control">
          <button type="button" className="btn" onClick={() => void refresh(true)} disabled={checking}>
            {checking ? 'Checking…' : 'Re-check'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            + API provider
          </button>
        </div>
      </div>
      <p className="lead">Every employee picks a provider in their profile. Subscriptions work through the official CLIs on this computer, so nothing is billed per token unless you add an API key.</p>
      {error && <div className="form-error">{error}</div>}

      <h4>Subscriptions (CLI logins)</h4>
      <div className="card">
        {BUILT_IN.map((id) => {
          const p = team.providers[id]
          if (!p) return null
          const st = statusOf(id)
          const kind = PROVIDER_KINDS.find((k) => k.id === p.kind)
          const users = usersOf(id)
          return (
            <div key={id} className="row">
              <span className={`status-dot${st ? (st.ok ? ' ok' : ' bad') : ''}`} />
              <div className="row-text">
                <div className="row-title">
                  {p.label}
                  {p.apiKey && <span className="badge">API key</span>}
                </div>
                <div className="row-hint">{st ? st.detail : kind?.hint}</div>
                <div className="row-hint">{users.length ? `Used by ${users.join(', ')}` : 'Not used by anyone yet'}</div>
              </div>
              <div className="row-control">
                <button type="button" className="btn" onClick={() => setEditing(id)}>
                  {p.apiKey ? 'Edit key' : 'Add API key'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <h4>API providers</h4>
      <div className="card">
        {Object.entries(team.providers).filter(([id]) => !BUILT_IN.includes(id)).length === 0 && (
          <div className="row">
            <div className="row-text">
              <div className="row-title">None yet</div>
              <div className="row-hint">Add Kimi, OpenRouter, DeepSeek, Groq, xAI Grok, Ollama or any OpenAI-compatible endpoint.</div>
            </div>
          </div>
        )}
        {Object.entries(team.providers)
          .filter(([id]) => !BUILT_IN.includes(id))
          .map(([id, p]) => {
            const st = statusOf(id)
            const users = usersOf(id)
            return (
              <div key={id} className="row">
                <span className={`status-dot${st ? (st.ok ? ' ok' : ' bad') : ''}`} />
                <div className="row-text">
                  <div className="row-title">
                    {p.label} <span className="muted small">{id}</span>
                  </div>
                  <div className="row-hint">
                    {p.baseUrl} · {st ? st.detail : 'checking…'}
                  </div>
                  <div className="row-hint">{users.length ? `Used by ${users.join(', ')}` : 'Not used by anyone yet'}</div>
                </div>
                <div className="row-control">
                  <button type="button" className="btn" onClick={() => setEditing(id)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger-ghost" onClick={() => void remove(id)} disabled={users.length > 0} title={users.length > 0 ? 'Move its employees to another provider first' : ''}>
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
      </div>

      {adding && <ProviderSheet team={team} id={null} onDone={() => setAdding(false)} />}
      {editing && <ProviderSheet team={team} id={editing} onDone={() => setEditing(null)} />}
    </>
  )
}

function ProviderSheet({ team, id, onDone }: { team: Team; id: string | null; onDone: () => void }) {
  const existing = id ? team.providers[id] : undefined
  const builtIn = id !== null && BUILT_IN.includes(id)
  const [preset, setPreset] = useState<string>('')
  const [pid, setPid] = useState(id ?? '')
  const [label, setLabel] = useState(existing?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '')
  const [models, setModels] = useState((existing?.models ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (presetId: string) => {
    setPreset(presetId)
    const p = API_PRESETS.find((x) => x.id === presetId)
    if (!p) return
    setPid(p.id)
    setLabel(p.label)
    setBaseUrl(p.baseUrl)
    setModels(p.models.join(', '))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const def: Partial<ProviderDef> = builtIn
        ? { apiKey: apiKey.trim() || undefined, label: label.trim() || existing?.label }
        : { kind: 'openai', label: label.trim() || pid, baseUrl: baseUrl.trim(), apiKey: apiKey.trim() || undefined, models: models.split(',').map((m) => m.trim()).filter(Boolean) }
      if (!builtIn && !/^[a-z0-9_-]+$/.test(pid)) throw new Error('Id must be lowercase letters, digits, - or _')
      await putProvider(pid, def)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const clearKey = async () => {
    setBusy(true)
    try {
      await putProvider(pid, { apiKey: '' })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const keyHint = API_PRESETS.find((p) => p.id === preset)?.keyHint

  return (
    <div className="modal-backdrop nested" onMouseDown={(e) => e.target === e.currentTarget && onDone()}>
      <div className="modal sheet" role="dialog">
        <h2>{builtIn ? `${existing?.label}: API key` : existing ? `Edit ${existing.label}` : 'Add API provider'}</h2>
        {error && <div className="form-error">{error}</div>}
        {builtIn ? (
          <>
            <p className="hint">
              {id === 'claude' && 'With a key, employees on Claude bill your Anthropic API account per token instead of using the subscription. Leave empty to keep the subscription login.'}
              {id === 'codex' && 'With a key, Codex bills your OpenAI API account instead of your ChatGPT subscription. Leave empty to keep `codex login`.'}
              {id === 'gemini' && 'With a key, Gemini CLI uses Google AI Studio billing instead of your Google account login. Leave empty to keep the account login.'}
            </p>
            <label className="field">
              <span>Label</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label className="field">
              <span>API key</span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="leave empty for subscription login" />
              {apiKey === '••••' && <small>A key is stored. Type a new one to replace it.</small>}
            </label>
          </>
        ) : (
          <>
            {!existing && (
              <label className="field">
                <span>Preset</span>
                <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
                  <option value="">Custom…</option>
                  {API_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Id</span>
              <input value={pid} onChange={(e) => setPid(e.target.value)} placeholder="kimi" disabled={existing !== undefined} />
            </label>
            <label className="field">
              <span>Label</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Kimi (Moonshot)" />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.moonshot.ai/v1" />
              <small>OpenAI-compatible: the server must expose /chat/completions and ideally /models.</small>
            </label>
            <label className="field">
              <span>API key</span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={keyHint ?? 'sk-…'} />
              {keyHint && <small>Get one at {keyHint}</small>}
            </label>
            <label className="field">
              <span>Models (comma separated, optional)</span>
              <input value={models} onChange={(e) => setModels(e.target.value)} placeholder="kimi-k2-thinking, kimi-k2-turbo-preview" />
            </label>
          </>
        )}
        <div className="actions">
          {builtIn && existing?.apiKey && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => void clearKey()} disabled={busy}>
              Remove key
            </button>
          )}
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || (!builtIn && (!pid.trim() || !baseUrl.trim()))} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
