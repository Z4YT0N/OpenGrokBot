import { useState } from 'react'
import { RATE_LIMIT_LABELS } from '../../../shared/catalog'
import type { AccountStatus, Conversation, McpServerDef, Team, TeamSettings, UsageSummary, UsageTotals } from '../../../shared/types'
import { deleteMcpServer, putMcpServer, putSettings, refreshAccount } from '../api'
import { formatCost, formatRelative, formatTokens, modelLabel } from '../format'
import { MARKETPLACE, type MarketplaceItem } from '../marketplace'
import { conversationTitle, personFor } from '../people'
import { Avatar } from './Avatar'
import { Providers } from './Providers'

export type SettingsSection = 'general' | 'team' | 'providers' | 'marketplace' | 'usage' | 'account'

interface SettingsProps {
  team: Team
  conversations: Conversation[]
  usage: UsageSummary
  account: AccountStatus
  section: SettingsSection
  onSection: (s: SettingsSection) => void
  onClose: () => void
  onEditAgent: (id: string | null) => void
}

const NAV: { id: SettingsSection; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'providers', label: 'Providers', icon: '🔌' },
  { id: 'marketplace', label: 'Marketplace', icon: '🧩' },
  { id: 'usage', label: 'Usage', icon: '📊' },
  { id: 'account', label: 'Claude account', icon: '🔑' },
]

export function Settings(props: SettingsProps) {
  const { section, onSection, onClose } = props
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings" role="dialog" aria-label="Settings">
        <nav className="settings-nav">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={section === n.id ? 'is-active' : ''} onClick={() => onSection(n.id)}>
              <span className="settings-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
          {section === 'general' && <General {...props} />}
          {section === 'team' && <TeamSection {...props} />}
          {section === 'providers' && <Providers team={props.team} />}
          {section === 'marketplace' && <Marketplace {...props} />}
          {section === 'usage' && <Usage {...props} />}
          {section === 'account' && <AccountSection {...props} />}
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>
}

function Row({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-title">{title}</div>
        {hint && <div className="row-hint">{hint}</div>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  )
}

/* ---------- General ---------- */

function General({ team }: SettingsProps) {
  const [company, setCompany] = useState(team.company)
  const [ownerName, setOwnerName] = useState(team.owner.name)
  const [ownerTitle, setOwnerTitle] = useState(team.owner.title)
  const [workspace, setWorkspace] = useState(team.workspace)
  const [settings, setSettings] = useState(team.settings)
  const [status, setStatus] = useState<string | null>(null)

  const save = async () => {
    setStatus('Saving…')
    try {
      await putSettings({ company, ownerName, ownerTitle, workspace, settings })
      setStatus('Saved')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <h1>General</h1>
      <h4>Company</h4>
      <Card>
        <Row title="Company name">
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Row>
        <Row title="Your name" hint="How employees address you.">
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Row>
        <Row title="Your title">
          <input value={ownerTitle} onChange={(e) => setOwnerTitle(e.target.value)} />
        </Row>
        <Row title="Workspace folder" hint="Default working directory for employees' tools.">
          <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="wide" />
        </Row>
      </Card>
      <h4>Conversation rules</h4>
      <Card>
        <Row title="When I post in a group without mentioning anyone" hint="Everyone: all unmuted members reply in order. Mentions only: just the first member (your manager) replies and pulls others in with @mentions.">
          <select value={settings.groupMode} onChange={(e) => setSettings({ ...settings, groupMode: e.target.value as TeamSettings['groupMode'] })}>
            <option value="everyone">Everyone replies</option>
            <option value="mentions-only">Mentions only</option>
          </select>
        </Row>
        <Row title="Employees reply in" hint="Auto mirrors whatever language you write in.">
          <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value as TeamSettings['language'] })}>
            <option value="auto">Auto (match me)</option>
            <option value="ar">Egyptian Arabic</option>
            <option value="en">English</option>
          </select>
        </Row>
        <Row title="Desktop notifications" hint="Notify when an employee finishes a reply while you are looking elsewhere.">
          <input type="checkbox" className="toggle" checked={settings.notifications} onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })} />
        </Row>
        <Row title="Max employee messages per round" hint="After you post in the group, at most this many replies before the floor returns to you.">
          <input type="number" min={1} max={30} value={settings.maxMessagesPerRound} onChange={(e) => setSettings({ ...settings, maxMessagesPerRound: Number(e.target.value) })} />
        </Row>
        <Row title="Max turns per employee per round" hint="Stops two colleagues ping-ponging forever.">
          <input type="number" min={1} max={10} value={settings.maxTurnsPerAgentPerRound} onChange={(e) => setSettings({ ...settings, maxTurnsPerAgentPerRound: Number(e.target.value) })} />
        </Row>
        <Row title="Max tool steps inside one reply" hint="How long an employee may work with tools before answering.">
          <input type="number" min={1} max={200} value={settings.maxTurnsPerReply} onChange={(e) => setSettings({ ...settings, maxTurnsPerReply: Number(e.target.value) })} />
        </Row>
      </Card>
      <div className="actions">
        <span className="status">{status}</span>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </>
  )
}

/* ---------- Team ---------- */

function TeamSection({ team, usage, onEditAgent }: SettingsProps) {
  return (
    <>
      <h1>Team</h1>
      <p className="lead">Every employee is an agent with its own persona, provider (Claude, Codex, Gemini or an API), model, effort, tools and memory. Click one to edit.</p>
      <Card>
        {team.agents.map((a) => {
          const p = personFor(team, a.id)
          const u = usage.byAgent[a.id]
          return (
            <button key={a.id} type="button" className="row row-button" onClick={() => onEditAgent(a.id)}>
              <Avatar person={p} size={36} />
              <div className="row-text">
                <div className="row-title">
                  {p.label}
                  {a.department && <span className="badge">{a.department}</span>}
                </div>
                <div className="row-hint">
                  {team.providers[a.provider]?.label ?? a.provider} · {modelLabel(a.model)} · {a.effort} effort · {a.tools.length ? a.tools.join(', ') : 'chat only'}{a.muted ? ' · muted' : ''}
                  {a.mcpServers.length > 0 && ` · MCP: ${a.mcpServers.join(', ')}`}
                </div>
              </div>
              <div className="row-control muted">{u ? `${formatTokens(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens)} tokens · ${formatCost(u.costUsd)}` : 'no usage yet'}</div>
            </button>
          )
        })}
      </Card>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => onEditAgent(null)}>
          + New employee
        </button>
      </div>
    </>
  )
}

/* ---------- Marketplace ---------- */

function Marketplace({ team }: SettingsProps) {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string>('All')
  const [adding, setAdding] = useState<MarketplaceItem | null>(null)
  const [custom, setCustom] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const installed = Object.keys(team.mcpServers)
  const categories = ['All', ...new Set(MARKETPLACE.map((m) => m.category))]
  const items = MARKETPLACE.filter((m) => (category === 'All' || m.category === category) && `${m.name} ${m.description}`.toLowerCase().includes(q.toLowerCase()))

  const remove = async (name: string) => {
    setError(null)
    try {
      await deleteMcpServer(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="marketplace-head">
        <h1>Marketplace</h1>
        <button type="button" className="btn" onClick={() => setCustom(true)}>
          + Custom MCP server
        </button>
      </div>
      <p className="lead">
        MCP servers give employees new abilities: GitHub, a browser, databases, Notion… They run locally on this computer through Claude Code. After adding one, enable it per employee in their profile.
      </p>
      {installed.length > 0 && (
        <>
          <h4>{installed.length} installed</h4>
          <Card>
            {installed.map((name) => {
              const def = team.mcpServers[name]
              const users = team.agents.filter((a) => a.mcpServers.includes(name)).map((a) => a.name)
              return (
                <Row key={name} title={name} hint={`${def?.type === 'stdio' ? `${def.command} ${(def.args ?? []).join(' ')}` : def?.url ?? ''}${users.length ? ` · used by ${users.join(', ')}` : ' · not enabled for anyone yet'}`}>
                  <button type="button" className="btn btn-danger-ghost" onClick={() => void remove(name)}>
                    Remove
                  </button>
                </Row>
              )
            })}
          </Card>
        </>
      )}
      {error && <div className="form-error">{error}</div>}
      <label className="search search-wide">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search servers" />
      </label>
      <div className="chips">
        {categories.map((c) => (
          <button key={c} type="button" className={`chip${category === c ? ' is-active' : ''}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="market-grid">
        {items.map((m) => (
          <div key={m.id} className="market-item">
            <span className="market-icon">{m.icon}</span>
            <div className="market-text">
              <div className="row-title">{m.name}</div>
              <div className="row-hint">{m.description}</div>
            </div>
            {installed.includes(m.id) ? (
              <span className="muted">Added</span>
            ) : (
              <button type="button" className="btn btn-pill" onClick={() => setAdding(m)}>
                Add
              </button>
            )}
          </div>
        ))}
      </div>
      {adding && <AddServer item={adding} onDone={() => setAdding(null)} />}
      {custom && <AddServer item={null} onDone={() => setCustom(false)} />}
    </>
  )
}

function AddServer({ item, onDone }: { item: MarketplaceItem | null; onDone: () => void }) {
  const [name, setName] = useState(item?.id ?? '')
  const [type, setType] = useState<McpServerDef['type']>(item?.def.type ?? 'stdio')
  const [command, setCommand] = useState(item?.def.type === 'stdio' ? item.def.command : 'npx')
  const [args, setArgs] = useState(item?.def.type === 'stdio' ? (item.def.args ?? []).join(' ') : '')
  const [url, setUrl] = useState(item && item.def.type !== 'stdio' ? item.def.url : '')
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [envText, setEnvText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const env: Record<string, string> = { ...secrets }
      for (const line of envText.split('\n')) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
        if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2]
      }
      for (const s of item?.secrets ?? []) if (!env[s.key]) throw new Error(`${s.label} is required.`)
      const def: McpServerDef =
        type === 'stdio'
          ? { type: 'stdio', command: command.trim(), ...(args.trim() ? { args: args.trim().split(/\s+/) } : {}), ...(Object.keys(env).length ? { env } : {}) }
          : { type, url: url.trim(), ...(Object.keys(env).length ? { headers: env } : {}) }
      await putMcpServer(name.trim(), def)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop nested" onMouseDown={(e) => e.target === e.currentTarget && onDone()}>
      <div className="modal sheet" role="dialog">
        <h2>{item ? `Add ${item.name}` : 'Custom MCP server'}</h2>
        {error && <div className="form-error">{error}</div>}
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="github" disabled={item !== null} />
        </label>
        {!item && (
          <label className="field">
            <span>Transport</span>
            <select value={type} onChange={(e) => setType(e.target.value as McpServerDef['type'])}>
              <option value="stdio">Local command (stdio)</option>
              <option value="http">Remote HTTP</option>
              <option value="sse">Remote SSE</option>
            </select>
          </label>
        )}
        {type === 'stdio' ? (
          <>
            <label className="field">
              <span>Command</span>
              <input value={command} onChange={(e) => setCommand(e.target.value)} />
            </label>
            <label className="field">
              <span>Arguments</span>
              <input value={args} onChange={(e) => setArgs(e.target.value)} />
              {item?.argHint && <small>{item.argHint}</small>}
            </label>
          </>
        ) : (
          <label className="field">
            <span>URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
        )}
        {(item?.secrets ?? []).map((s) => (
          <label key={s.key} className="field">
            <span>{s.label}</span>
            <input type="password" value={secrets[s.key] ?? ''} onChange={(e) => setSecrets({ ...secrets, [s.key]: e.target.value })} placeholder={s.key} />
          </label>
        ))}
        <label className="field">
          <span>{type === 'stdio' ? 'Extra environment variables' : 'Extra headers'} (optional)</span>
          <textarea rows={2} value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder={'KEY=value\nOTHER=value'} />
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy ? 'Adding…' : 'Add server'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Usage ---------- */

function totalsRow(t: UsageTotals) {
  return (
    <>
      <td>{t.messages}</td>
      <td>{formatTokens(t.inputTokens)}</td>
      <td>{formatTokens(t.cacheReadTokens)}</td>
      <td>{formatTokens(t.cacheCreationTokens)}</td>
      <td>{formatTokens(t.outputTokens)}</td>
      <td className="num-strong">{formatCost(t.costUsd)}</td>
    </>
  )
}

function Usage({ team, conversations, usage }: SettingsProps) {
  const t = usage.total
  const allIn = t.inputTokens + t.cacheReadTokens + t.cacheCreationTokens
  const agents = [...team.agents].sort((a, b) => (usage.byAgent[b.id]?.costUsd ?? 0) - (usage.byAgent[a.id]?.costUsd ?? 0))
  const convs = [...conversations].filter((c) => usage.byConversation[c.id]).sort((a, b) => (usage.byConversation[b.id]?.costUsd ?? 0) - (usage.byConversation[a.id]?.costUsd ?? 0))
  return (
    <>
      <h1>Usage</h1>
      <p className="lead">Everything runs on your Claude subscription, so the dollar figures are what the same tokens would cost on the API, not a bill. Use them to compare employees and conversations.</p>
      <div className="stats">
        <div className="stat">
          <div className="stat-value">{formatTokens(allIn)}</div>
          <div className="stat-label">input tokens</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatTokens(t.outputTokens)}</div>
          <div className="stat-label">output tokens</div>
        </div>
        <div className="stat">
          <div className="stat-value">{t.messages}</div>
          <div className="stat-label">employee replies</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatCost(t.costUsd)}</div>
          <div className="stat-label">API-equivalent</div>
        </div>
      </div>
      <h4>By employee</h4>
      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Replies</th>
              <th>Input</th>
              <th>Cache read</th>
              <th>Cache write</th>
              <th>Output</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const u = usage.byAgent[a.id]
              const p = personFor(team, a.id)
              return (
                <tr key={a.id}>
                  <td>
                    <span className="cell-person">
                      <Avatar person={p} size={22} />
                      {p.label}
                      <span className="muted"> · {modelLabel(a.model)}</span>
                    </span>
                  </td>
                  {u ? totalsRow(u) : <td colSpan={6} className="muted">no usage yet</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      {convs.length > 0 && (
        <>
          <h4>By conversation</h4>
          <Card>
            <table className="table">
              <thead>
                <tr>
                  <th>Conversation</th>
                  <th>Replies</th>
                  <th>Input</th>
                  <th>Cache read</th>
                  <th>Cache write</th>
                  <th>Output</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {convs.map((c) => {
                  const u = usage.byConversation[c.id]
                  return (
                    <tr key={c.id}>
                      <td className="cell-clip">{c.kind === 'group' ? `Group · ${conversationTitle(team, c)}` : `DM · ${conversationTitle(team, c)}`}</td>
                      {u && totalsRow(u)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      {Object.keys(usage.byModel).length > 0 && (
        <>
          <h4>By model</h4>
          <Card>
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Replies</th>
                  <th>Input</th>
                  <th>Cache read</th>
                  <th>Cache write</th>
                  <th>Output</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(usage.byModel).map(([m, u]) => (
                  <tr key={m}>
                    <td>{m.split('+').map(modelLabel).join(' + ')}</td>
                    {totalsRow(u)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  )
}

/* ---------- Account ---------- */

function AccountSection({ account }: SettingsProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const windows = Object.values(account.windows).sort((a, b) => a.type.localeCompare(b.type))
  const refresh = async () => {
    setBusy(true)
    setError(null)
    try {
      await refreshAccount()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const auth = account.authSource === undefined ? 'unknown until an employee speaks' : account.authSource === 'none' ? 'Claude subscription (Claude Code login)' : `API key (${account.authSource})`
  return (
    <>
      <h1>Claude account</h1>
      <h4>Connection</h4>
      <Card>
        <Row title="Signed in through" hint={`Claude Code ${account.claudeCodeVersion ?? ''}`.trim()}>
          <span>{auth}</span>
        </Row>
        <Row title="Refresh limits" hint="Runs a one-word Haiku turn to read the current limit windows. Costs almost nothing.">
          <button type="button" className="btn" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Checking…' : 'Check now'}
          </button>
        </Row>
      </Card>
      {error && <div className="form-error">{error}</div>}
      <h4>Limits</h4>
      <Card>
        {windows.length === 0 ? (
          <Row title="No limit data yet" hint="Claude reports the windows as employees talk. Press Check now to fetch them." />
        ) : (
          windows.map((w) => {
            const pct = typeof w.utilization === 'number' ? Math.min(100, Math.round(w.utilization * 100)) : null
            const tone = w.status === 'rejected' ? 'is-danger' : w.status === 'allowed_warning' || (pct ?? 0) >= 80 ? 'is-warn' : ''
            return (
              <div key={w.type} className="limit">
                <div className="limit-head">
                  <span className="row-title">{RATE_LIMIT_LABELS[w.type]}</span>
                  <span className="muted">
                    {pct === null ? w.status : `${pct}% used`}
                    {w.resetsAt ? ` · resets ${formatRelative(w.resetsAt * (w.resetsAt < 1e12 ? 1000 : 1))}` : ''}
                  </span>
                </div>
                <div className={`bar ${tone}`}>
                  <div className="bar-fill" style={{ width: `${pct ?? (w.status === 'rejected' ? 100 : 0)}%` }} />
                </div>
              </div>
            )
          })
        )}
        {account.updatedAt && <div className="muted small">Last update {formatRelative(account.updatedAt)}</div>}
      </Card>
    </>
  )
}
