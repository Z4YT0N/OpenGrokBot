import { query } from '@anthropic-ai/claude-agent-sdk'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Agent, Message, Team } from '../shared/types.js'

const MAX_CHARS = 4000
const MODEL = 'claude-haiku-4-5'

/**
 * Long-term notes per employee, kept as a small markdown file and injected into their
 * system prompt. Updated in the background by a cheap model after they speak.
 */
export class Memory {
  private readonly dir: string
  private readonly busy = new Set<string>()

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'memory')
    mkdirSync(this.dir, { recursive: true })
  }

  file(agentId: string): string {
    return path.join(this.dir, `${agentId}.md`)
  }

  read(agentId: string): string {
    const f = this.file(agentId)
    return existsSync(f) ? readFileSync(f, 'utf8') : ''
  }

  write(agentId: string, text: string): void {
    const f = this.file(agentId)
    const tmp = `${f}.tmp`
    writeFileSync(tmp, text.trim().slice(0, MAX_CHARS * 2))
    renameSync(tmp, f)
  }

  clear(agentId: string): void {
    const f = this.file(agentId)
    if (existsSync(f)) unlinkSync(f)
  }

  /**
   * Fold the messages of a finished round into the employee's notes. Runs at most one
   * update per employee at a time and swallows its own errors: memory is best effort.
   */
  async update(team: Team, agent: Agent, recent: Message[]): Promise<void> {
    if (this.busy.has(agent.id) || recent.length === 0) return
    this.busy.add(agent.id)
    try {
      const names = new Map<string, string>([['user', team.owner.name]])
      for (const a of team.agents) names.set(a.id, a.name)
      const transcript = recent
        .filter((m) => m.status === 'done' && m.text.trim())
        .map((m) => `[${names.get(m.authorId) ?? m.authorId}]: ${m.text.replace(/\s+/g, ' ').slice(0, 600)}`)
        .join('\n')
      const current = this.read(agent.id)
      const prompt = `Current notes of ${agent.name} (${agent.role}):\n${current || '(empty)'}\n\nNew conversation excerpt:\n${transcript}\n\nRewrite the notes.`
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ANTHROPIC_API_KEY' && k !== 'ANTHROPIC_AUTH_TOKEN') env[k] = v
      let out = ''
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), 60_000)
      try {
        const q = query({
          prompt,
          options: {
            model: MODEL,
            systemPrompt: `You maintain the long-term working notes of one employee at ${team.company}. Keep only durable facts worth remembering across conversations: the boss's stable preferences and decisions, project facts (names, paths, URLs, stack), commitments this employee made, open threads they own, and lessons from mistakes. Drop chit-chat, one-off details and anything already stale. Write terse markdown bullets under short headings, at most ${MAX_CHARS} characters, in the language the notes are already in (English if empty). Output only the notes.`,
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
        for await (const msg of q) if (msg.type === 'result' && msg.subtype === 'success') out = msg.result
      } finally {
        clearTimeout(timer)
      }
      const notes = out.trim()
      if (notes && notes !== current.trim()) this.write(agent.id, notes)
    } catch {
      // best effort
    } finally {
      this.busy.delete(agent.id)
    }
  }
}
