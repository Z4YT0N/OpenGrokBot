import express from 'express'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account } from './account.js'
import { Approvals } from './approvals.js'
import { CRON_PRESETS, nextRun } from './cron.js'
import { emit, subscribe } from './events.js'
import { Memory } from './memory.js'
import { Orchestrator } from './orchestrator.js'
import { providerStatuses } from './providers/index.js'
import { Routines } from './routines.js'
import { Store } from './store.js'
import { loadTeam, parseAgent, parseMcpServer, parseProvider, parseSkill, parseTeam, saveTeam, TeamError } from './team.js'
import { summarizeUsage } from './usage.js'
import type { AppState, Attachment, Team } from '../shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// Works both from server/ (tsx) and dist/server/ (built).
const root = existsSync(path.join(here, '..', 'team.example.json')) ? path.join(here, '..') : path.join(here, '..', '..')

const PORT = Number(process.env.PORT ?? 4310)
/** 127.0.0.1 by default. Set HOST=0.0.0.0 plus OPENGROKBOT_TOKEN to reach it from your phone or a VPS. */
const HOST = process.env.HOST ?? '127.0.0.1'
const TOKEN = process.env.OPENGROKBOT_TOKEN?.trim() || null
if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !TOKEN) {
  console.error('[opengrokbot] Refusing to listen on a non-local address without OPENGROKBOT_TOKEN. Set the token, or keep HOST=127.0.0.1.')
  process.exit(1)
}

/** OPENGROKBOT_TEAM / OPENGROKBOT_DATA let you run a second, separate office (demos, tests) from the same install. */
const teamFile = process.env.OPENGROKBOT_TEAM ? path.resolve(process.env.OPENGROKBOT_TEAM) : path.join(root, 'team.json')
if (!existsSync(teamFile)) copyFileSync(path.join(root, 'team.example.json'), teamFile)
const dataDir = process.env.OPENGROKBOT_DATA ? path.resolve(process.env.OPENGROKBOT_DATA) : path.join(root, 'data')
const uploadsDir = path.join(dataDir, 'uploads')
mkdirSync(uploadsDir, { recursive: true })
let team = loadTeam(teamFile)
const store = new Store(dataDir)
store.seed(team)
const account = new Account(path.join(dataDir, 'account.json'))
const approvals = new Approvals()
const memory = new Memory(dataDir)
const orchestrator = new Orchestrator(() => team, store, account, approvals, memory)
const routines = new Routines(dataDir, (r) => orchestrator.runRoutine(r))
routines.start()

const app = express()
app.disable('x-powered-by')

// ---- remote access (optional) ----
const COOKIE = 'ogb_token'
app.use((req, res, next) => {
  if (!TOKEN) return next()
  const q = typeof req.query.token === 'string' ? req.query.token : null
  if (q === TOKEN) {
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(TOKEN)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`)
    res.redirect(req.path === '/' ? '/' : req.path)
    return
  }
  const cookie = req.headers.cookie?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const ok = (cookie && decodeURIComponent(cookie.slice(COOKIE.length + 1)) === TOKEN) || bearer === TOKEN
  if (ok) return next()
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  res.status(401).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenGrokBot</title><body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><form onsubmit="location.href=\'/?token=\'+encodeURIComponent(document.getElementById(\'t\').value);return false" style="display:flex;gap:8px"><input id="t" type="password" placeholder="Access token" style="padding:10px 14px;border-radius:10px;border:1px solid #333;background:#1c1c1c;color:#eee"><button style="padding:10px 16px;border-radius:10px;border:0;background:#fff;color:#111;font-weight:700">Open</button></form></body>')
})

app.use(express.json({ limit: '2mb' }))

/** API keys never leave the server. */
function publicTeam(t: Team): Team {
  const providers: Team['providers'] = {}
  for (const [id, p] of Object.entries(t.providers)) providers[id] = { ...p, ...(p.apiKey ? { apiKey: '••••' } : {}) }
  return { ...t, providers }
}

function state(): AppState {
  return { team: publicTeam(team), conversations: store.list(), busy: orchestrator.busyIds(), usage: summarizeUsage(store.list()), account: account.get(), routines: routines.list(), approvals: approvals.list() }
}

/** Validate a whole new team, persist it, reseed conversations, and broadcast. */
function applyTeam(next: Team): void {
  saveTeam(teamFile, next)
  team = next
  store.seed(team)
  emit({ type: 'team', team: publicTeam(team), conversations: store.list() })
}

function broadcastConversations(): void {
  emit({ type: 'team', team: publicTeam(team), conversations: store.list() })
}

function teamError(res: express.Response, err: unknown): void {
  if (err instanceof TeamError) res.status(400).json({ error: err.message })
  else res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
}

/** Files employees may show you: anything under the workspace, an employee's folder, or uploads. */
function allowedFile(p: string): boolean {
  if (!path.isAbsolute(p) || !existsSync(p)) return false
  // Windows paths compare case-insensitively (E: vs e:).
  const norm = (s: string): string => (process.platform === 'win32' ? path.resolve(s).toLowerCase() : path.resolve(s))
  const abs = norm(p)
  const roots = [team.workspace, uploadsDir, ...team.agents.map((a) => a.cwd).filter((c): c is string => typeof c === 'string')].map(norm)
  return roots.some((r) => abs === r || abs.startsWith(r + path.sep))
}

app.get('/api/state', (_req, res) => {
  res.json(state())
})

// ---- conversations ----

app.post('/api/conversations', (req, res) => {
  const body = (req.body ?? {}) as { name?: unknown; memberIds?: unknown }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New chat'
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((m): m is string => typeof m === 'string' && team.agents.some((a) => a.id === m)) : []
  if (memberIds.length === 0) {
    res.status(400).json({ error: 'pick at least one employee' })
    return
  }
  const c = store.createGroup(name, memberIds)
  broadcastConversations()
  res.json({ conversation: c })
})

app.put('/api/conversations/:id', (req, res) => {
  const id = String(req.params.id)
  const body = (req.body ?? {}) as { name?: unknown; memberIds?: unknown; pinned?: unknown; hidden?: unknown }
  const patch: { name?: string; memberIds?: string[]; pinned?: boolean; hidden?: boolean } = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (Array.isArray(body.memberIds)) patch.memberIds = body.memberIds.filter((m): m is string => typeof m === 'string' && team.agents.some((a) => a.id === m))
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned
  if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
  const c = store.update(id, patch)
  if (!c) {
    res.status(404).json({ error: 'unknown conversation' })
    return
  }
  broadcastConversations()
  res.json({ conversation: c })
})

app.delete('/api/conversations/:id', (req, res) => {
  const id = String(req.params.id)
  if (orchestrator.isBusy(id)) {
    res.status(409).json({ error: 'stop the running round first' })
    return
  }
  if (!store.delete(id)) {
    res.status(400).json({ error: 'only extra group chats can be deleted' })
    return
  }
  broadcastConversations()
  emit({ type: 'usage', usage: summarizeUsage(store.list()) })
  res.json({ ok: true })
})

app.post('/api/conversations/:id/messages', (req, res) => {
  const id = String(req.params.id)
  const body = (req.body ?? {}) as { text?: unknown; attachments?: unknown; replyTo?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!store.get(id)) {
    res.status(404).json({ error: 'unknown conversation' })
    return
  }
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter((a): a is Attachment => typeof a === 'object' && a !== null && typeof (a as Attachment).path === 'string' && allowedFile((a as Attachment).path))
    : []
  if (text.length === 0 && attachments.length === 0) {
    res.status(400).json({ error: 'empty message' })
    return
  }
  const rt = body.replyTo as { messageId?: unknown; authorId?: unknown; excerpt?: unknown } | undefined
  const replyTo = rt && typeof rt.messageId === 'string' && typeof rt.authorId === 'string' && typeof rt.excerpt === 'string' ? { messageId: rt.messageId, authorId: rt.authorId, excerpt: rt.excerpt.slice(0, 200) } : undefined
  const message = orchestrator.post(id, text || '(see attached files)', { attachments, ...(replyTo ? { replyTo } : {}) })
  res.json({ message })
})

app.post('/api/conversations/:id/stop', (req, res) => {
  orchestrator.stop(String(req.params.id))
  res.json({ ok: true })
})

app.post('/api/conversations/:id/clear', (req, res) => {
  const id = String(req.params.id)
  if (orchestrator.isBusy(id)) {
    res.status(409).json({ error: 'stop the running round first' })
    return
  }
  if (!store.clear(id)) {
    res.status(404).json({ error: 'unknown conversation' })
    return
  }
  broadcastConversations()
  emit({ type: 'usage', usage: summarizeUsage(store.list()) })
  res.json({ ok: true })
})

app.get('/api/conversations/:id/export.md', (req, res) => {
  const c = store.get(String(req.params.id))
  if (!c) {
    res.status(404).send('unknown conversation')
    return
  }
  const names = new Map<string, string>([['user', team.owner.name], ['routine', 'Routine']])
  for (const a of team.agents) names.set(a.id, `${a.name} | ${a.role}`)
  const lines = [`# ${c.kind === 'group' ? c.name : `DM with ${names.get(c.memberIds.find((m) => m !== 'user') ?? '') ?? c.name}`}`, '']
  for (const m of c.messages) {
    lines.push(`**${names.get(m.authorId) ?? m.authorId}** · ${new Date(m.createdAt).toLocaleString()}`, '', m.text, '')
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${c.id}.md"`)
  res.send(lines.join('\n'))
})

// ---- files: uploads, previews, open ----

/** Raw-body upload: PUT the file bytes, get an Attachment back. */
app.put('/api/uploads/:conversationId/:name', express.raw({ type: () => true, limit: '60mb' }), (req, res) => {
  const conv = String(req.params.conversationId).replace(/[^a-z0-9_-]/gi, '')
  const safe = String(req.params.name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'file'
  const dir = path.join(uploadsDir, conv)
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const file = path.join(dir, `${stamp}-${safe}`)
  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: 'empty upload' })
    return
  }
  writeFileSync(file, body)
  const attachment: Attachment = { name: safe, path: file, mime: String(req.headers['content-type'] ?? 'application/octet-stream'), size: body.length }
  res.json({ attachment })
})

/** Serve a produced or uploaded file for inline preview (images, html, text, pdf). */
app.get('/api/file', (req, res) => {
  const p = typeof req.query.path === 'string' ? req.query.path : ''
  if (!allowedFile(p) || !statSync(p).isFile()) {
    res.status(404).send('not found')
    return
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(path.resolve(p))
})

/** Open a file an employee produced with the OS default app (browser for .html). Local app, local disk. */
app.post('/api/open', (req, res) => {
  const p = typeof req.body?.path === 'string' ? req.body.path.trim() : ''
  if (!p || !path.isAbsolute(p) || !existsSync(p)) {
    res.status(400).json({ error: 'file not found' })
    return
  }
  const cmd = process.platform === 'win32' ? (['cmd', ['/c', 'start', '', p]] as const) : process.platform === 'darwin' ? (['open', [p]] as const) : (['xdg-open', [p]] as const)
  try {
    spawn(cmd[0], [...cmd[1]], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ---- approvals ----

app.post('/api/approvals/:id', (req, res) => {
  const id = String(req.params.id)
  const body = (req.body ?? {}) as { allow?: unknown; always?: unknown }
  const allow = body.allow === true
  const request = approvals.resolve(id, allow)
  if (!request) {
    res.status(404).json({ error: 'no such pending approval' })
    return
  }
  if (allow && body.always === true) {
    const rule = { id: randomUUID().slice(0, 8), action: 'allow' as const, tool: request.tool }
    try {
      applyTeam(parseTeam({ ...team, settings: { ...team.settings, autoReview: [...team.settings.autoReview, rule] } }, root))
    } catch (err) {
      teamError(res, err)
      return
    }
  }
  res.json({ ok: true })
})

// ---- memory ----

app.get('/api/team/agents/:id/memory', (req, res) => {
  res.json({ notes: memory.read(String(req.params.id)) })
})

app.put('/api/team/agents/:id/memory', (req, res) => {
  const id = String(req.params.id)
  if (!team.agents.some((a) => a.id === id)) {
    res.status(404).json({ error: 'unknown employee' })
    return
  }
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : ''
  if (notes.trim()) memory.write(id, notes)
  else memory.clear(id)
  res.json({ ok: true })
})

// ---- team editing ----

app.put('/api/team/agents/:id', (req, res) => {
  const id = String(req.params.id)
  const current = team.agents.find((a) => a.id === id)
  if (!current) {
    res.status(404).json({ error: 'unknown employee' })
    return
  }
  try {
    const patched = parseAgent({ ...current, ...(req.body as object), id }, current.name)
    const next: Team = { ...team, agents: team.agents.map((a) => (a.id === id ? patched : a)) }
    applyTeam(parseTeam(next, root))
    res.json({ agent: patched })
  } catch (err) {
    teamError(res, err)
  }
})

app.post('/api/team/agents', (req, res) => {
  try {
    const agent = parseAgent(req.body, 'new employee')
    if (team.agents.some((a) => a.id === agent.id)) throw new TeamError(`team: an employee with id "${agent.id}" already exists`)
    applyTeam(parseTeam({ ...team, agents: [...team.agents, agent] }, root))
    res.json({ agent })
  } catch (err) {
    teamError(res, err)
  }
})

app.post('/api/team/agents/import', (req, res) => {
  try {
    const body = (req.body ?? {}) as { agent?: unknown }
    const raw = (typeof body.agent === 'object' && body.agent !== null ? body.agent : req.body) as Record<string, unknown>
    let id = typeof raw.id === 'string' ? raw.id : ''
    let n = 2
    const base = id || 'employee'
    while (!id || team.agents.some((a) => a.id === id)) id = `${base}-${n++}`
    let name = typeof raw.name === 'string' ? raw.name : 'NEW'
    while (team.agents.some((a) => a.name.toUpperCase() === name.toUpperCase())) name = `${name} 2`
    const agent = parseAgent({ ...raw, id, name, provider: typeof raw.provider === 'string' && raw.provider in team.providers ? raw.provider : 'claude', mcpServers: [] }, 'import')
    applyTeam(parseTeam({ ...team, agents: [...team.agents, agent] }, root))
    res.json({ agent })
  } catch (err) {
    teamError(res, err)
  }
})

app.post('/api/team/agents/:id/duplicate', (req, res) => {
  const source = team.agents.find((a) => a.id === String(req.params.id))
  if (!source) {
    res.status(404).json({ error: 'unknown employee' })
    return
  }
  try {
    let n = 2
    while (team.agents.some((a) => a.id === `${source.id}-${n}`)) n++
    const copy = parseAgent({ ...source, id: `${source.id}-${n}`, name: `${source.name} ${n}` }, 'copy')
    applyTeam(parseTeam({ ...team, agents: [...team.agents, copy] }, root))
    res.json({ agent: copy })
  } catch (err) {
    teamError(res, err)
  }
})

/** Shareable employee file. Employees hold no secrets; provider and MCP links are reset on import. */
app.get('/api/team/agents/:id/export.json', (req, res) => {
  const a = team.agents.find((x) => x.id === String(req.params.id))
  if (!a) {
    res.status(404).json({ error: 'unknown employee' })
    return
  }
  const { cwd: _cwd, ...rest } = a
  res.setHeader('Content-Disposition', `attachment; filename="${a.id}.opengrokbot.json"`)
  res.json({ opengrokbot: 1, agent: { ...rest, provider: 'claude', mcpServers: [] } })
})

app.delete('/api/team/agents/:id', (req, res) => {
  const id = String(req.params.id)
  if (!team.agents.some((a) => a.id === id)) {
    res.status(404).json({ error: 'unknown employee' })
    return
  }
  try {
    applyTeam(parseTeam({ ...team, agents: team.agents.filter((a) => a.id !== id) }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

app.put('/api/team/mcp/:name', (req, res) => {
  const name = String(req.params.name)
  try {
    const def = parseMcpServer(req.body, name)
    applyTeam(parseTeam({ ...team, mcpServers: { ...team.mcpServers, [name]: def } }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

app.delete('/api/team/mcp/:name', (req, res) => {
  const name = String(req.params.name)
  const { [name]: _removed, ...rest } = team.mcpServers
  try {
    const agents = team.agents.map((a) => ({ ...a, mcpServers: a.mcpServers.filter((s) => s !== name) }))
    applyTeam(parseTeam({ ...team, mcpServers: rest, agents }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

// ---- skills ----

app.put('/api/team/skills/:id', (req, res) => {
  const id = String(req.params.id)
  try {
    const skill = parseSkill(req.body, id)
    applyTeam(parseTeam({ ...team, skills: { ...team.skills, [id]: skill } }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

app.delete('/api/team/skills/:id', (req, res) => {
  const { [String(req.params.id)]: _removed, ...rest } = team.skills
  try {
    applyTeam(parseTeam({ ...team, skills: rest }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

// ---- providers ----

app.get('/api/providers/status', async (req, res) => {
  try {
    res.json({ statuses: await providerStatuses(team, req.query.force === '1') })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.put('/api/team/providers/:id', (req, res) => {
  const id = String(req.params.id)
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const current = team.providers[id]
    // "••••" means "keep the stored key".
    const apiKey = body.apiKey === '••••' ? current?.apiKey : body.apiKey
    const def = parseProvider({ ...(current ?? {}), ...body, apiKey }, id)
    if (current && current.kind !== def.kind && ['claude', 'codex', 'gemini'].includes(id)) throw new TeamError('team: built-in providers keep their kind')
    applyTeam(parseTeam({ ...team, providers: { ...team.providers, [id]: def } }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

app.delete('/api/team/providers/:id', (req, res) => {
  const id = String(req.params.id)
  if (['claude', 'codex', 'gemini'].includes(id)) {
    res.status(400).json({ error: 'built-in providers cannot be removed' })
    return
  }
  if (team.agents.some((a) => a.provider === id)) {
    res.status(409).json({ error: 'an employee still uses this provider' })
    return
  }
  const { [id]: _removed, ...rest } = team.providers
  try {
    applyTeam(parseTeam({ ...team, providers: rest }, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

app.put('/api/team/settings', (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const next = {
      ...team,
      company: typeof body.company === 'string' && body.company.trim() ? body.company.trim() : team.company,
      workspace: typeof body.workspace === 'string' && body.workspace.trim() ? body.workspace.trim() : team.workspace,
      owner: { ...team.owner, ...(typeof body.ownerName === 'string' && body.ownerName.trim() ? { name: body.ownerName.trim() } : {}), ...(typeof body.ownerTitle === 'string' && body.ownerTitle.trim() ? { title: body.ownerTitle.trim() } : {}) },
      settings: { ...team.settings, ...(typeof body.settings === 'object' && body.settings !== null ? (body.settings as object) : {}) },
    }
    applyTeam(parseTeam(next, root))
    res.json({ ok: true })
  } catch (err) {
    teamError(res, err)
  }
})

// ---- routines ----

app.get('/api/routines/presets', (_req, res) => {
  res.json({ presets: CRON_PRESETS })
})

app.put('/api/routines/:id', (req, res) => {
  const id = String(req.params.id)
  const b = (req.body ?? {}) as Record<string, unknown>
  try {
    const agentId = typeof b.agentId === 'string' ? b.agentId : ''
    const conversationId = typeof b.conversationId === 'string' ? b.conversationId : ''
    if (!team.agents.some((a) => a.id === agentId)) throw new TeamError('routine: pick an employee')
    if (!store.get(conversationId)) throw new TeamError('routine: pick a conversation')
    const cron = typeof b.cron === 'string' ? b.cron.trim() : ''
    if (cron && !nextRun(cron)) throw new TeamError('routine: that schedule never runs')
    const instruction = typeof b.instruction === 'string' ? b.instruction.trim() : ''
    if (!instruction) throw new TeamError('routine: write the instruction')
    const routine = routines.upsert({
      id,
      name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Routine',
      agentId,
      conversationId,
      cron,
      instruction,
      enabled: b.enabled !== false,
    })
    res.json({ routine })
  } catch (err) {
    if (err instanceof Error && !(err instanceof TeamError) && /cron|range|step|value/.test(err.message)) res.status(400).json({ error: `routine: ${err.message}` })
    else teamError(res, err)
  }
})

app.delete('/api/routines/:id', (req, res) => {
  res.json({ ok: routines.delete(String(req.params.id)) })
})

app.post('/api/routines/:id/run', async (req, res) => {
  const extra = typeof req.body?.text === 'string' ? req.body.text : undefined
  const run = await routines.trigger(String(req.params.id), extra)
  if (!run) {
    res.status(404).json({ error: 'unknown routine' })
    return
  }
  res.json({ run })
})

/** Webhook trigger for Slack, GitHub, Zapier, cron services… The body is appended to the instruction. */
app.post('/api/hooks/:id', express.text({ type: '*/*', limit: '1mb' }), (req, res) => {
  const r = routines.get(String(req.params.id))
  if (!r) {
    res.status(404).json({ error: 'unknown routine' })
    return
  }
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  void routines.trigger(r.id, raw.trim() ? `Trigger payload:\n${raw.slice(0, 4000)}` : undefined)
  res.json({ ok: true, routine: r.name })
})

app.post('/api/account/refresh', async (_req, res) => {
  try {
    await orchestrator.probeAccount()
    res.json({ account: account.get() })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write(': connected\n\n')
  const unsubscribe = subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  })
  const ping = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => {
    clearInterval(ping)
    unsubscribe()
  })
})

const clientDir = path.join(root, 'dist', 'client')
if (existsSync(clientDir)) {
  app.use(express.static(clientDir))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
}

app.listen(PORT, HOST, () => {
  console.log(`[opengrokbot] ${team.company}: ${team.agents.map((a) => a.name).join(', ')} online at http://${HOST}:${PORT}${TOKEN ? ' (token required)' : ''}`)
})
