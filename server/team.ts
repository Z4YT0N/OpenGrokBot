import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Agent, Team } from '../shared/types.js'

const PERMISSION_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'])
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

function fail(msg: string): never {
  throw new Error(`team.json: ${msg}`)
}

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${field} must be a non-empty string`)
  return v
}

function parseAgent(raw: unknown, i: number): Agent {
  if (typeof raw !== 'object' || raw === null) fail(`agents[${i}] must be an object`)
  const r = raw as Record<string, unknown>
  const id = asString(r.id, `agents[${i}].id`)
  if (!/^[a-z0-9_-]+$/.test(id)) fail(`agents[${i}].id must be lowercase letters, digits, - or _`)
  const permissionMode = r.permissionMode === undefined ? 'dontAsk' : asString(r.permissionMode, `agents[${i}].permissionMode`)
  if (!PERMISSION_MODES.has(permissionMode)) fail(`agents[${i}].permissionMode is invalid`)
  const effort = r.effort === undefined ? 'medium' : asString(r.effort, `agents[${i}].effort`)
  if (!EFFORTS.has(effort)) fail(`agents[${i}].effort is invalid`)
  const tools = Array.isArray(r.tools) ? r.tools.filter((t): t is string => typeof t === 'string') : []
  const agent: Agent = {
    id,
    name: asString(r.name, `agents[${i}].name`),
    role: asString(r.role, `agents[${i}].role`),
    color: asString(r.color, `agents[${i}].color`),
    model: r.model === undefined ? 'claude-opus-5' : asString(r.model, `agents[${i}].model`),
    effort: effort as Agent['effort'],
    personality: asString(r.personality, `agents[${i}].personality`),
    tools,
    permissionMode: permissionMode as Agent['permissionMode'],
  }
  if (typeof r.cwd === 'string' && r.cwd.length > 0) agent.cwd = r.cwd
  return agent
}

export function loadTeam(file: string): Team {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof raw !== 'object' || raw === null) fail('root must be an object')
  const r = raw as Record<string, unknown>
  const owner = (typeof r.owner === 'object' && r.owner !== null ? r.owner : {}) as Record<string, unknown>
  const agentsRaw = Array.isArray(r.agents) ? r.agents : fail('agents must be an array')
  const agents = agentsRaw.map(parseAgent)
  const ids = new Set(agents.map((a) => a.id))
  if (ids.size !== agents.length) fail('agent ids must be unique')
  const names = new Set(agents.map((a) => a.name.toUpperCase()))
  if (names.size !== agents.length) fail('agent names must be unique (case-insensitive)')
  const workspace = typeof r.workspace === 'string' && r.workspace.length > 0 ? r.workspace : path.dirname(file)
  return {
    company: typeof r.company === 'string' ? r.company : 'My Company',
    owner: {
      id: 'user',
      name: typeof owner.name === 'string' ? owner.name : 'You',
      title: typeof owner.title === 'string' ? owner.title : 'Owner',
    },
    workspace: path.resolve(workspace),
    agents,
  }
}
