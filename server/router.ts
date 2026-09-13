import { query } from '@anthropic-ai/claude-agent-sdk'
import { capability } from './prompt.js'
import type { Agent, Conversation, Team } from '../shared/types.js'

export type RouteMode = 'build' | 'answer' | 'discuss'

export interface Route {
  speakers: Agent[]
  mode: RouteMode
  /** Why the router chose them; shown nowhere yet, useful in logs. */
  why: string
}

const ROUTER_MODEL = 'claude-haiku-4-5'

function memberLines(team: Team, members: Agent[]): string {
  return members
    .map((a) => `- id=${a.id} · ${a.name} (${a.role}) · ${capability(a)}${a.scope ? ` · owns: ${a.scope}` : ''}${a.muted ? ' · muted (only if clearly for them)' : ''}`)
    .join('\n')
}

function systemPrompt(team: Team, members: Agent[]): string {
  const manager = members[0]
  return `You are the dispatcher of ${team.company}'s group chat. The boss (${team.owner.name}) just posted. Decide which employees should respond, and reply with JSON only:
{"speakers":["id", ...],"mode":"build"|"answer"|"discuss","why":"short reason"}

Employees:
${memberLines(team, members)}

Rules:
- One speaker is the norm. Two when the message clearly spans two domains. Three at most. Never more.
- "build": the boss wants something made, written, fixed or shown (a file, page, section, code, design, document, script, query). Pick exactly ONE employee who "builds files and code" and whose domain fits. Do not pick the manager or a chat-only employee for a build request. If nobody can build, pick the manager.
- "answer": a question or request inside one domain. Pick that domain's owner.
- "discuss": broad strategy, priorities, hiring, money, a complaint, frustration, a greeting, or an unclear message. Pick the manager (${manager?.name ?? 'the first employee'}) only.
- If the boss is replying to a specific employee's question or continuing their thread, pick that employee.
- If the boss says everyone should weigh in, pick up to three most relevant.
- Ignore @mentions; they are handled elsewhere.`
}

function context(team: Team, conversation: Conversation): string {
  const names = new Map<string, string>([['user', team.owner.name]])
  for (const a of team.agents) names.set(a.id, a.name)
  const recent = conversation.messages.filter((m) => m.status === 'done' && m.text.trim()).slice(-7)
  const lines = recent.map((m) => `[${names.get(m.authorId) ?? m.authorId}]: ${m.text.replace(/\s+/g, ' ').slice(0, 400)}`)
  return lines.join('\n')
}

function parse(text: string, members: Agent[]): { ids: string[]; mode: RouteMode; why: string } | null {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { speakers?: unknown; mode?: unknown; why?: unknown }
    const ids = Array.isArray(j.speakers) ? j.speakers.filter((s): s is string => typeof s === 'string') : []
    const known = ids.map((id) => members.find((a) => a.id === id || a.name.toLowerCase() === id.toLowerCase())?.id).filter((id): id is string => id !== undefined)
    const mode: RouteMode = j.mode === 'build' || j.mode === 'answer' ? j.mode : 'discuss'
    return { ids: [...new Set(known)].slice(0, 3), mode, why: typeof j.why === 'string' ? j.why : '' }
  } catch {
    return null
  }
}

/**
 * Picks who should reply to the boss's latest message in a group. Uses a fast model with no
 * tools; falls back to the manager (first member) if anything goes wrong.
 */
export async function routeSpeakers(team: Team, conversation: Conversation, userText: string, signal: AbortSignal): Promise<Route> {
  const members = team.agents.filter((a) => conversation.memberIds.includes(a.id))
  const manager = members.find((a) => !a.muted) ?? members[0]
  const fallback: Route = { speakers: manager ? [manager] : [], mode: 'discuss', why: 'fallback' }
  if (members.length <= 1) return { speakers: members, mode: 'answer', why: 'single member' }

  const abort = new AbortController()
  const onAbort = (): void => abort.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => abort.abort(), 25_000)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ANTHROPIC_API_KEY' && k !== 'ANTHROPIC_AUTH_TOKEN') env[k] = v

  let text = ''
  try {
    const q = query({
      prompt: `Recent messages:\n${context(team, conversation)}\n\nLatest message from the boss:\n${userText}\n\nJSON:`,
      options: {
        model: ROUTER_MODEL,
        systemPrompt: systemPrompt(team, members),
        tools: [],
        allowedTools: [],
        permissionMode: 'dontAsk',
        settingSources: [],
        maxTurns: 1,
        env,
        abortController: abort,
        cwd: team.workspace,
      },
    })
    for await (const msg of q) {
      if (msg.type === 'result' && msg.subtype === 'success') text = msg.result
    }
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
  const parsed = parse(text, members)
  if (!parsed || parsed.ids.length === 0) return fallback
  const speakers = parsed.ids.map((id) => members.find((a) => a.id === id)).filter((a): a is Agent => a !== undefined)
  return { speakers, mode: parsed.mode, why: parsed.why }
}

export const __test = { parse, systemPrompt }
