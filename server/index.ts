import express from 'express'
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account } from './account.js'
import { emit, subscribe } from './events.js'
import { Orchestrator } from './orchestrator.js'
import { providerStatuses } from './providers/index.js'
import { Store } from './store.js'
import { loadTeam, parseAgent, parseMcpServer, parseProvider, parseTeam, saveTeam, TeamError } from './team.js'
import { summarizeUsage } from './usage.js'
import type { AppState, Team } from '../shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// Works both from server/ (tsx) and dist/server/ (built).
const root = existsSync(path.join(here, '..', 'team.example.json')) ? path.join(here, '..') : path.join(here, '..', '..')

const PORT = Number(process.env.PORT ?? 4310)
const teamFile = path.join(root, 'team.json')
if (!existsSync(teamFile)) copyFileSync(path.join(root, 'team.example.json'), teamFile)
const dataDir = path.join(root, 'data')
let team = loadTeam(teamFile)
const store = new Store(dataDir)
store.seed(team)
const account = new Account(path.join(dataDir, 'account.json'))
const orchestrator = new Orchestrator(() => team, store, account)

const app = express()
app.use(express.json({ limit: '1mb' }))

/** API keys never leave the server. */
function publicTeam(t: Team): Team {
  const providers: Team['providers'] = {}
  for (const [id, p] of Object.entries(t.providers)) providers[id] = { ...p, ...(p.apiKey ? { apiKey: '••••' } : {}) }
  return { ...t, providers }
}

function state(): AppState {
  return { team: publicTeam(team), conversations: store.list(), busy: orchestrator.busyIds(), usage: summarizeUsage(store.list()), account: account.get() }
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
  const body = (req.body ?? {}) as { name?: unknown; memberIds?: unknown; pinned?: unknown }
  const patch: { name?: string; memberIds?: string[]; pinned?: boolean } = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (Array.isArray(body.memberIds)) patch.memberIds = body.memberIds.filter((m): m is string => typeof m === 'string' && team.agents.some((a) => a.id === m))
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned
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
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!store.get(id)) {
    res.status(404).json({ error: 'unknown conversation' })
    return
  }
  if (text.length === 0) {
    res.status(400).json({ error: 'empty message' })
    return
  }
  const message = orchestrator.post(id, text)
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
  const names = new Map<string, string>([['user', team.owner.name]])
  for (const a of team.agents) names.set(a.id, `${a.name} | ${a.role}`)
  const lines = [`# ${c.kind === 'group' ? c.name : `DM with ${names.get(c.memberIds.find((m) => m !== 'user') ?? '') ?? c.name}`}`, '']
  for (const m of c.messages) {
    lines.push(`**${names.get(m.authorId) ?? m.authorId}** · ${new Date(m.createdAt).toLocaleString()}`, '', m.text, '')
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${c.id}.md"`)
  res.send(lines.join('\n'))
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[opengrokbot] ${team.company}: ${team.agents.map((a) => a.name).join(', ')} online at http://127.0.0.1:${PORT}`)
})
