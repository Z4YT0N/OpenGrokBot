import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Agent, McpServerDef, Team, TeamSettings } from '../shared/types.js'

const PERMISSION_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'])
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
const SHAPES = new Set(['blob', 'round', 'triangle', 'hex', 'drop'])

const DEFAULT_SETTINGS: TeamSettings = { maxMessagesPerRound: 8, maxTurnsPerAgentPerRound: 2, maxTurnsPerReply: 40 }

export class TeamError extends Error {}

function fail(msg: string): never {
  throw new TeamError(`team: ${msg}`)
}

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${field} must be a non-empty string`)
  return v
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.length > 0) : []
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asStringMap(v: unknown): Record<string, string> | undefined {
  const r = asRecord(v)
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(r)) if (typeof val === 'string') out[k] = val
  return Object.keys(out).length > 0 ? out : undefined
}

export function parseAgent(raw: unknown, label = 'agent'): Agent {
  const r = asRecord(raw)
  const id = asString(r.id, `${label}.id`)
  if (!/^[a-z0-9_-]+$/.test(id)) fail(`${label}.id must be lowercase letters, digits, - or _`)
  const permissionMode = r.permissionMode === undefined ? 'dontAsk' : asString(r.permissionMode, `${label}.permissionMode`)
  if (!PERMISSION_MODES.has(permissionMode)) fail(`${label}.permissionMode is invalid`)
  const effort = r.effort === undefined ? 'medium' : asString(r.effort, `${label}.effort`)
  if (!EFFORTS.has(effort)) fail(`${label}.effort is invalid`)
  const shape = r.shape === undefined ? 'blob' : asString(r.shape, `${label}.shape`)
  if (!SHAPES.has(shape)) fail(`${label}.shape must be one of ${[...SHAPES].join(', ')}`)
  const name = asString(r.name, `${label}.name`).trim()
  if (/\s/.test(name) === false && name.includes('@')) fail(`${label}.name must not contain @`)
  const agent: Agent = {
    id,
    name,
    role: asString(r.role, `${label}.role`).trim(),
    shape: shape as Agent['shape'],
    color: asString(r.color, `${label}.color`),
    model: r.model === undefined ? 'claude-opus-5' : asString(r.model, `${label}.model`),
    effort: effort as Agent['effort'],
    personality: asString(r.personality, `${label}.personality`),
    tools: asStringList(r.tools),
    permissionMode: permissionMode as Agent['permissionMode'],
    mcpServers: asStringList(r.mcpServers),
    inheritClaudeSettings: r.inheritClaudeSettings === true,
    autoApproveTools: r.autoApproveTools === true,
  }
  if (typeof r.cwd === 'string' && r.cwd.trim().length > 0) agent.cwd = r.cwd.trim()
  if (typeof r.department === 'string' && r.department.trim().length > 0) agent.department = r.department.trim()
  return agent
}

export function parseMcpServer(raw: unknown, label = 'mcp server'): McpServerDef {
  const r = asRecord(raw)
  const type = r.type === undefined ? 'stdio' : asString(r.type, `${label}.type`)
  if (type === 'stdio') {
    const def: McpServerDef = { type: 'stdio', command: asString(r.command, `${label}.command`) }
    const args = asStringList(r.args)
    if (args.length > 0) def.args = args
    const env = asStringMap(r.env)
    if (env) def.env = env
    return def
  }
  if (type === 'http' || type === 'sse') {
    const def: McpServerDef = { type, url: asString(r.url, `${label}.url`) }
    const headers = asStringMap(r.headers)
    if (headers) def.headers = headers
    return def
  }
  return fail(`${label}.type must be stdio, http or sse`)
}

function parseSettings(raw: unknown): TeamSettings {
  const r = asRecord(raw)
  const num = (k: keyof TeamSettings, min: number, max: number): number => {
    const v = r[k]
    if (v === undefined) return DEFAULT_SETTINGS[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`settings.${k} must be a number`)
    return Math.min(max, Math.max(min, Math.round(v)))
  }
  return {
    maxMessagesPerRound: num('maxMessagesPerRound', 1, 30),
    maxTurnsPerAgentPerRound: num('maxTurnsPerAgentPerRound', 1, 10),
    maxTurnsPerReply: num('maxTurnsPerReply', 1, 200),
  }
}

export function validateTeam(team: Team): void {
  const ids = new Set(team.agents.map((a) => a.id))
  if (ids.size !== team.agents.length) fail('agent ids must be unique')
  const names = new Set(team.agents.map((a) => a.name.toUpperCase()))
  if (names.size !== team.agents.length) fail('agent names must be unique (case-insensitive)')
  for (const a of team.agents) {
    for (const s of a.mcpServers) if (!(s in team.mcpServers)) fail(`${a.name} references unknown MCP server "${s}"`)
  }
}

export function parseTeam(raw: unknown, fallbackWorkspace: string): Team {
  const r = asRecord(raw)
  const owner = asRecord(r.owner)
  const agentsRaw = Array.isArray(r.agents) ? r.agents : fail('agents must be an array')
  const agents = agentsRaw.map((a, i) => parseAgent(a, `agents[${i}]`))
  const mcpServers: Record<string, McpServerDef> = {}
  for (const [name, def] of Object.entries(asRecord(r.mcpServers))) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) fail(`mcpServers name "${name}" must be letters, digits, - or _`)
    mcpServers[name] = parseMcpServer(def, `mcpServers.${name}`)
  }
  const workspace = typeof r.workspace === 'string' && r.workspace.length > 0 ? r.workspace : fallbackWorkspace
  const team: Team = {
    company: typeof r.company === 'string' ? r.company : 'My Company',
    owner: {
      id: 'user',
      name: typeof owner.name === 'string' ? owner.name : 'You',
      title: typeof owner.title === 'string' ? owner.title : 'Owner',
    },
    workspace: path.resolve(workspace),
    agents,
    mcpServers,
    settings: parseSettings(r.settings),
  }
  validateTeam(team)
  return team
}

export function loadTeam(file: string): Team {
  return parseTeam(JSON.parse(readFileSync(file, 'utf8')), path.dirname(file))
}

export function saveTeam(file: string, team: Team): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(team, null, 2)}\n`)
  renameSync(tmp, file)
}
