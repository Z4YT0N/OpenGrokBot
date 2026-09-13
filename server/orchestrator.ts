import { randomUUID } from 'node:crypto'
import type { Account } from './account.js'
import { providerKeepsSession, runAgentTurn } from './agent.js'
import { reviewByRules, type Approvals } from './approvals.js'
import { emit } from './events.js'
import { collectAttachments } from './files.js'
import type { Memory } from './memory.js'
import { findMentions } from './mentions.js'
import { routeSpeakers, type RouteMode } from './router.js'
import type { Store } from './store.js'
import { summarizeUsage } from './usage.js'
import type { Agent, Attachment, Conversation, Message, ProviderDef, Routine, Team } from '../shared/types.js'

interface RoundState {
  running: boolean
  abort: AbortController | null
  pending: { message: Message; forced?: Agent[]; note?: string }[]
}

/**
 * Decide who speaks first for an owner message without the router (DMs, mentions, the
 * non-smart group modes). Returns null when the smart router should decide. Exported for tests.
 */
export function initialQueue(team: Team, conversation: Conversation, userText: string): Agent[] | null {
  const members = team.agents.filter((a) => conversation.memberIds.includes(a.id))
  if (conversation.kind === 'dm') return members
  const mentioned = findMentions(userText, members)
  if (mentioned.length > 0) return mentioned
  const unmuted = members.filter((a) => !a.muted)
  if (team.settings.groupMode === 'mentions-only') return unmuted.slice(0, 1)
  if (team.settings.groupMode === 'everyone') return unmuted
  return null
}

/** Expand /skill-id tokens into the skill's instructions. Exported for tests. */
export function expandSkills(team: Team, text: string): string {
  return text.replace(/(^|\s)\/([a-z0-9_-]+)\b/g, (whole, lead: string, id: string) => {
    const skill = team.skills[id]
    if (!skill) return whole
    return `${lead}[Skill "${skill.name}": ${skill.body.trim()}]`
  })
}

const BUILD_NOTE = 'Dispatcher: the boss asked for something to be made. Build it now with your tools, then reply with the full path and one or two sentences. No plans, no options, no questions.'
const ROUTINE_NOTE = 'This is a scheduled routine, not a live chat. Do the job fully with your tools, then post the result here. If a source is unavailable, say so instead of guessing.'

const FALLBACK_PROVIDER: ProviderDef = { kind: 'claude', label: 'Claude (subscription)' }

export interface PostOptions {
  attachments?: Attachment[]
  replyTo?: Message['replyTo']
  /** Author id; defaults to the owner. Routines post as 'routine'. */
  authorId?: string
  /** Skip routing and make exactly these employees reply. */
  forced?: Agent[]
  note?: string
}

export class Orchestrator {
  private readonly rounds = new Map<string, RoundState>()

  constructor(
    private readonly getTeam: () => Team,
    private readonly store: Store,
    private readonly account: Account,
    private readonly approvals: Approvals,
    private readonly memory: Memory,
    /** Whether a file path may be shown in the chat (inside the workspace, an employee folder, or uploads). */
    private readonly allowedFile: (p: string) => boolean,
  ) {}

  isBusy(conversationId: string): boolean {
    return this.rounds.get(conversationId)?.running ?? false
  }

  busyIds(): string[] {
    return [...this.rounds.entries()].filter(([, s]) => s.running).map(([id]) => id)
  }

  /** Post a message and start (or queue) a round of replies. */
  post(conversationId: string, text: string, opts: PostOptions = {}): Message {
    const conversation = this.store.get(conversationId)
    if (!conversation) throw new Error(`unknown conversation ${conversationId}`)
    const message: Message = {
      id: randomUUID(),
      conversationId,
      authorId: opts.authorId ?? 'user',
      text: expandSkills(this.getTeam(), text),
      createdAt: Date.now(),
      status: 'done',
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    }
    this.store.addMessage(conversationId, message)
    emit({ type: 'message:done', message })

    const state = this.state(conversationId)
    const job = { message, ...(opts.forced ? { forced: opts.forced } : {}), ...(opts.note ? { note: opts.note } : {}) }
    if (state.running) state.pending.push(job)
    else void this.runRound(conversationId, job)
    return message
  }

  /** Run a routine: post its instruction as a routine message and make its owner reply. */
  async runRoutine(routine: Routine): Promise<{ messageId?: string }> {
    const team = this.getTeam()
    const agent = team.agents.find((a) => a.id === routine.agentId)
    if (!agent) throw new Error(`employee ${routine.agentId} no longer exists`)
    const conversation = this.store.get(routine.conversationId)
    if (!conversation) throw new Error(`conversation ${routine.conversationId} no longer exists`)
    if (!conversation.memberIds.includes(agent.id)) throw new Error(`${agent.name} is not in that conversation`)
    const before = conversation.messages.length
    const trigger = this.post(routine.conversationId, `⏰ ${routine.name}\n${routine.instruction}`, { authorId: 'routine', forced: [agent], note: ROUTINE_NOTE })
    await this.waitForIdle(routine.conversationId)
    const reply = this.store.get(routine.conversationId)?.messages.slice(before + 1).find((m) => m.authorId === agent.id)
    if (!reply) return {}
    if (reply.status === 'error') throw new Error(reply.text.replace(/^⚠️\s*/, ''))
    void trigger
    return { messageId: reply.id }
  }

  stop(conversationId: string): void {
    const state = this.rounds.get(conversationId)
    if (!state) return
    state.pending = []
    state.abort?.abort()
  }

  /** Runs a minimal Claude turn just to refresh the account's rate-limit picture. */
  async probeAccount(): Promise<void> {
    const team = this.getTeam()
    const base = team.agents[0]
    const probe: Agent = {
      ...(base ?? { id: 'x', name: 'X', role: 'X', color: '#fff', shape: 'blob', permissionMode: 'dontAsk', effort: 'low', personality: '', tools: [], mcpServers: [], inheritClaudeSettings: false, autoApproveTools: false, muted: false, model: '', provider: 'claude', approvals: 'auto' }),
      id: 'probe',
      name: 'PROBE',
      provider: 'claude',
      model: 'claude-haiku-4-5',
      effort: 'low',
      tools: [],
      mcpServers: [],
      inheritClaudeSettings: false,
      autoApproveTools: false,
      approvals: 'auto',
      personality: 'Reply with the single word OK.',
    }
    const conversation: Conversation = {
      id: 'probe',
      kind: 'dm',
      name: 'probe',
      memberIds: ['user', 'probe'],
      messages: [{ id: 'p', conversationId: 'probe', authorId: 'user', text: 'ping', createdAt: Date.now(), status: 'done' }],
      sessions: {},
    }
    await runAgentTurn({
      team: { ...team, agents: [probe] },
      conversation,
      agent: probe,
      provider: team.providers.claude ?? FALLBACK_PROVIDER,
      sessionId: undefined,
      signal: new AbortController().signal,
      handlers: {
        onDelta: () => {},
        onActivity: () => {},
        onSession: () => {},
        onInit: (src, ver) => this.account.noteInit(src, ver),
        onRateLimit: (info) => this.account.noteRateLimit(info),
      },
    })
    emit({ type: 'account', account: this.account.get() })
  }

  private waitForIdle(conversationId: string): Promise<void> {
    return new Promise((resolve) => {
      const check = (): void => {
        const s = this.rounds.get(conversationId)
        if (!s || (!s.running && s.pending.length === 0)) resolve()
        else setTimeout(check, 500)
      }
      check()
    })
  }

  private state(conversationId: string): RoundState {
    let s = this.rounds.get(conversationId)
    if (!s) {
      s = { running: false, abort: null, pending: [] }
      this.rounds.set(conversationId, s)
    }
    return s
  }

  private async runRound(conversationId: string, job: RoundState['pending'][number]): Promise<void> {
    const state = this.state(conversationId)
    state.running = true
    state.abort = new AbortController()
    emit({ type: 'round', conversationId, running: true })
    const startIndex = this.store.get(conversationId)?.messages.length ?? 0
    const spoke = new Set<string>()
    try {
      await this.speakers(conversationId, job, state.abort.signal, spoke)
    } finally {
      state.running = false
      state.abort = null
      emit({ type: 'round', conversationId, running: false })
      this.remember(conversationId, startIndex - 1, spoke)
      const next = state.pending.shift()
      if (next) void this.runRound(conversationId, next)
    }
  }

  /** Background memory update for everyone who spoke this round. */
  private remember(conversationId: string, fromIndex: number, spoke: Set<string>): void {
    const team = this.getTeam()
    const conversation = this.store.get(conversationId)
    if (!conversation || spoke.size === 0) return
    const recent = conversation.messages.slice(Math.max(0, fromIndex))
    for (const id of spoke) {
      const agent = team.agents.find((a) => a.id === id)
      if (agent) void this.memory.update(team, agent, recent)
    }
  }

  private async speakers(conversationId: string, job: RoundState['pending'][number], signal: AbortSignal, spoke: Set<string>): Promise<void> {
    const conversation = this.store.get(conversationId)
    if (!conversation) return
    const team = this.getTeam()
    const members = team.agents.filter((a) => conversation.memberIds.includes(a.id))
    let queue = job.forced ?? initialQueue(team, conversation, job.message.text)
    let mode: RouteMode = 'discuss'
    if (queue === null) {
      const route = await routeSpeakers(team, conversation, job.message.text, signal)
      queue = route.speakers
      mode = route.mode
      console.log(`[router] ${conversation.id}: ${route.speakers.map((a) => a.name).join(', ') || 'nobody'} (${route.mode}) — ${route.why}`)
    }
    const turns = new Map<string, number>()
    let count = 0
    let first = true

    while (queue.length > 0 && count < team.settings.maxMessagesPerRound && !signal.aborted) {
      const agent = queue.shift()
      if (!agent) break
      // A newer owner message arrived mid-round: let the next round handle it with fresh context.
      if (this.state(conversationId).pending.length > 0) break
      count++
      turns.set(agent.id, (turns.get(agent.id) ?? 0) + 1)
      const buildNote = first && mode === 'build' && agent.tools.some((t) => ['Edit', 'Write'].includes(t)) ? BUILD_NOTE : undefined
      const note = first ? (job.note ?? buildNote) : undefined
      first = false
      const reply = await this.turn(conversationId, agent, signal, note)
      if (reply) spoke.add(agent.id)
      if (!reply) continue
      for (const m of findMentions(reply, members, agent.id)) {
        const taken = turns.get(m.id) ?? 0
        if (taken >= team.settings.maxTurnsPerAgentPerRound) continue
        if (queue.some((q) => q.id === m.id)) continue
        queue.push(m)
      }
    }
  }

  /** Runs one agent turn, streaming into a message. Returns the final text ('' if skipped/error). */
  private async turn(conversationId: string, agent: Agent, signal: AbortSignal, note?: string): Promise<string> {
    const conversation = this.store.get(conversationId)
    if (!conversation) return ''
    const team = this.getTeam()
    const provider = team.providers[agent.provider] ?? FALLBACK_PROVIDER
    const message: Message = {
      id: randomUUID(),
      conversationId,
      authorId: agent.id,
      text: '',
      createdAt: Date.now(),
      status: 'streaming',
      activity: [],
    }
    emit({ type: 'typing', conversationId, agentId: agent.id, on: true })
    let started = false
    const start = (): void => {
      if (started) return
      started = true
      this.store.addMessage(conversationId, message)
      emit({ type: 'message:start', message })
    }

    // Sessions are per provider kind: switching an employee to another provider starts fresh.
    const sessionKey = `${agent.id}@${provider.kind}`
    const sessionId = providerKeepsSession(provider.kind) ? conversation.sessions[sessionKey] : undefined
    const notes = this.memory.read(agent.id)

    const result = await runAgentTurn({
      team,
      conversation,
      agent,
      provider,
      sessionId,
      signal,
      notes,
      ...(note ? { note } : {}),
      handlers: {
        onDelta: (delta) => {
          start()
          message.text += delta
          emit({ type: 'message:delta', conversationId, messageId: message.id, delta })
        },
        onActivity: (line) => {
          start()
          message.activity?.push(line)
          emit({ type: 'message:activity', conversationId, messageId: message.id, line })
        },
        onSession: (id) => {
          this.store.setSession(conversationId, sessionKey, id)
        },
        onInit: (src, ver) => {
          if (this.account.noteInit(src, ver)) emit({ type: 'account', account: this.account.get() })
        },
        onRateLimit: (info) => {
          this.account.noteRateLimit(info)
          emit({ type: 'account', account: this.account.get() })
        },
        onToolPermission: async (tool, input) => {
          const verdict = reviewByRules(this.getTeam(), tool, input)
          if (verdict === 'allow') return true
          start()
          const line = `Waiting for your approval: ${tool}`
          message.activity?.push(line)
          emit({ type: 'message:activity', conversationId, messageId: message.id, line })
          return this.approvals.ask(conversationId, agent.id, tool, input, signal)
        },
      },
    })
    emit({ type: 'typing', conversationId, agentId: agent.id, on: false })

    if (result.error && /session|resume|not found|No conversation found|thread/i.test(result.error) && sessionId) {
      // The stored session is gone (e.g. transcript deleted). Forget it and retry once fresh.
      this.store.clearSession(conversationId, sessionKey)
      if (!started) return this.turn(conversationId, agent, signal, note)
    }

    const usagePatch = result.usage ? { usage: result.usage } : {}

    if (result.error) {
      start()
      const text = message.text.trim().length > 0 ? message.text : `⚠️ ${result.error}`
      const done = this.store.updateMessage(conversationId, message.id, { text, status: 'error', ...usagePatch }) ?? { ...message, text, status: 'error' as const }
      emit({ type: 'message:done', message: done })
      this.emitUsage()
      return ''
    }

    if (result.text.length === 0) {
      // The agent chose to skip. Keep the cost on the books but drop the bubble.
      if (started) {
        this.store.removeMessage(conversationId, message.id)
        emit({ type: 'message:remove', conversationId, messageId: message.id })
      }
      if (result.usage) this.store.recordSilentUsage(conversationId, agent.id, result.usage)
      this.emitUsage()
      return ''
    }

    start()
    const attachments = collectAttachments(result.text, message.activity ?? [], this.allowedFile)
    const done = this.store.updateMessage(conversationId, message.id, { text: result.text, status: 'done', ...usagePatch, ...(attachments.length ? { attachments } : {}) }) ?? { ...message, text: result.text, status: 'done' as const }
    emit({ type: 'message:done', message: done })
    this.emitUsage()
    return result.text
  }

  private emitUsage(): void {
    emit({ type: 'usage', usage: summarizeUsage(this.store.list()) })
  }
}
