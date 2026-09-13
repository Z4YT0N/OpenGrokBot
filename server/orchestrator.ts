import { randomUUID } from 'node:crypto'
import type { Account } from './account.js'
import { providerKeepsSession, runAgentTurn } from './agent.js'
import { emit } from './events.js'
import { findMentions } from './mentions.js'
import type { Store } from './store.js'
import { summarizeUsage } from './usage.js'
import type { Agent, Conversation, Message, ProviderDef, Team } from '../shared/types.js'

interface RoundState {
  running: boolean
  abort: AbortController | null
  pending: Message[]
}

/** Decide who speaks first for an owner message. Exported for tests. */
export function initialQueue(team: Team, conversation: Conversation, userText: string): Agent[] {
  const members = team.agents.filter((a) => conversation.memberIds.includes(a.id))
  if (conversation.kind === 'dm') return members
  const mentioned = findMentions(userText, members)
  if (mentioned.length > 0) return mentioned
  const unmuted = members.filter((a) => !a.muted)
  if (team.settings.groupMode === 'mentions-only') return unmuted.slice(0, 1)
  return unmuted
}

const FALLBACK_PROVIDER: ProviderDef = { kind: 'claude', label: 'Claude (subscription)' }

export class Orchestrator {
  private readonly rounds = new Map<string, RoundState>()

  constructor(
    private readonly getTeam: () => Team,
    private readonly store: Store,
    private readonly account: Account,
  ) {}

  isBusy(conversationId: string): boolean {
    return this.rounds.get(conversationId)?.running ?? false
  }

  busyIds(): string[] {
    return [...this.rounds.entries()].filter(([, s]) => s.running).map(([id]) => id)
  }

  /** Post an owner message and start (or queue) a round of replies. */
  post(conversationId: string, text: string): Message {
    const conversation = this.store.get(conversationId)
    if (!conversation) throw new Error(`unknown conversation ${conversationId}`)
    const message: Message = {
      id: randomUUID(),
      conversationId,
      authorId: 'user',
      text,
      createdAt: Date.now(),
      status: 'done',
    }
    this.store.addMessage(conversationId, message)
    emit({ type: 'message:done', message })

    const state = this.state(conversationId)
    if (state.running) {
      state.pending.push(message)
    } else {
      void this.runRound(conversationId, message)
    }
    return message
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
      ...(base ?? { id: 'x', name: 'X', role: 'X', color: '#fff', shape: 'blob', permissionMode: 'dontAsk', effort: 'low', personality: '', tools: [], mcpServers: [], inheritClaudeSettings: false, autoApproveTools: false, muted: false, model: '', provider: 'claude' }),
      id: 'probe',
      name: 'PROBE',
      provider: 'claude',
      model: 'claude-haiku-4-5',
      effort: 'low',
      tools: [],
      mcpServers: [],
      inheritClaudeSettings: false,
      autoApproveTools: false,
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

  private state(conversationId: string): RoundState {
    let s = this.rounds.get(conversationId)
    if (!s) {
      s = { running: false, abort: null, pending: [] }
      this.rounds.set(conversationId, s)
    }
    return s
  }

  private async runRound(conversationId: string, trigger: Message): Promise<void> {
    const state = this.state(conversationId)
    state.running = true
    state.abort = new AbortController()
    emit({ type: 'round', conversationId, running: true })
    try {
      await this.speakers(conversationId, trigger, state.abort.signal)
    } finally {
      state.running = false
      state.abort = null
      emit({ type: 'round', conversationId, running: false })
      const next = state.pending.shift()
      if (next) void this.runRound(conversationId, next)
    }
  }

  private async speakers(conversationId: string, trigger: Message, signal: AbortSignal): Promise<void> {
    const conversation = this.store.get(conversationId)
    if (!conversation) return
    const team = this.getTeam()
    const members = team.agents.filter((a) => conversation.memberIds.includes(a.id))
    const queue = initialQueue(team, conversation, trigger.text)
    const turns = new Map<string, number>()
    let count = 0

    while (queue.length > 0 && count < team.settings.maxMessagesPerRound && !signal.aborted) {
      const agent = queue.shift()
      if (!agent) break
      // A newer owner message arrived mid-round: let the next round handle it with fresh context.
      if (this.state(conversationId).pending.length > 0) break
      count++
      turns.set(agent.id, (turns.get(agent.id) ?? 0) + 1)
      const reply = await this.turn(conversationId, agent, signal)
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
  private async turn(conversationId: string, agent: Agent, signal: AbortSignal): Promise<string> {
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

    const result = await runAgentTurn({
      team,
      conversation,
      agent,
      provider,
      sessionId,
      signal,
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
      },
    })
    emit({ type: 'typing', conversationId, agentId: agent.id, on: false })

    if (result.error && /session|resume|not found|No conversation found|thread/i.test(result.error) && sessionId) {
      // The stored session is gone (e.g. transcript deleted). Forget it and retry once fresh.
      this.store.clearSession(conversationId, sessionKey)
      if (!started) return this.turn(conversationId, agent, signal)
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
    const done = this.store.updateMessage(conversationId, message.id, { text: result.text, status: 'done', ...usagePatch }) ?? { ...message, text: result.text, status: 'done' as const }
    emit({ type: 'message:done', message: done })
    this.emitUsage()
    return result.text
  }

  private emitUsage(): void {
    emit({ type: 'usage', usage: summarizeUsage(this.store.list()) })
  }
}
