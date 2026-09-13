import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { subscribe } from './events.js'
import { Orchestrator } from './orchestrator.js'
import { Store } from './store.js'
import { loadTeam } from './team.js'
import type { AppState } from '../shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// Works both from server/ (tsx) and dist/server/ (built).
const root = existsSync(path.join(here, '..', 'team.json')) ? path.join(here, '..') : path.join(here, '..', '..')

const PORT = Number(process.env.PORT ?? 4310)
const team = loadTeam(path.join(root, 'team.json'))
const store = new Store(path.join(root, 'data'))
store.seed(team)
const orchestrator = new Orchestrator(team, store)

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/api/state', (_req, res) => {
  const state: AppState = { team, conversations: store.list(), busy: orchestrator.busyIds() }
  res.json(state)
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
