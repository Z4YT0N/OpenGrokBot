import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account } from './account.js'
import { emit, subscribe } from './events.js'
import { Orchestrator } from './orchestrator.js'
import { Store } from './store.js'
import { loadTeam, parseAgent, parseMcpServer, parseTeam, saveTeam, TeamError } from './team.js'
import { summarizeUsage } from './usage.js'
import type { AppState, Team } from '../shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// Works both from server/ (tsx) and dist/server/ (built).
const root = existsSync(path.join(here, '..', 'team.json')) ? path.join(here, '..') : path.join(here, '..', '..')

const PORT = Number(process.env.PORT ?? 4310)
const teamFile = path.join(root, 'team.json')
const dataDir = path.join(root, 'data')
let team = loadTeam(teamFile)
const store = new Store(dataDir)
store.seed(team)
const account = new Account(path.join(dataDir, 'account.json'))
const orchestrator = new Orchestrator(() => team, store, account)

const app = express()
app.use(express.json({ limit: '1mb' }))

function state(): AppState {
  return { team, conversations: store.list(), busy: orchestrator.busyIds(), usage: summarizeUsage(store.list()), account: account.get() }
}

/** Validate a whole new team, persist it, reseed conversations, and broadcast. */
function applyTeam(next: Team): void {
  saveTeam(teamFile, next)
  team = next
  store.seed(team)
  emit({ type: 'team', team, conversations: store.list() })
}

function teamError(res: express.Response, err: unknown): void {
  if (err instanceof TeamError) res.status(400).json({ error: err.message })
  else res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
}

app.get('/api/state', (_req, res) => {
  res.json(state())
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
  const cleared = store.clear(id)
  if (!cleared) {
    res.status(404).json({ error: 'unknown conversation' })
    return
  }
  emit({ type: 'team', team, conversations: store.list() })
  emit({ type: 'usage', usage: summarizeUsage(store.list()) })
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
  console.log(`[fortune-office] ${team.company}: ${team.agents.map((a) => a.name).join(', ')} online at http://127.0.0.1:${PORT}`)
})
