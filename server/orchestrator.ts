import { randomUUID } from 'node:crypto'
import { runAgentTurn } from './agent.js'
import { emit } from './events.js'
import { findMentions } from './mentions.js'
import type { Store } from './store.js'
import type { Agent, Conversation, Message, Team } from '../shared/types.js'

const MAX_AGENT_MESSAGES_PER_ROUND = 6
const MAX_TURNS_PER_AGENT_PER_ROUND = 2

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
  return mentioned.length > 0 ? mentioned : members
}

export class Orchestrator {
  private readonly rounds = new Map<string, RoundState>()

  constructor(
    private readonly team: Team,
    private readonly store: Store,
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
    const members = this.team.agents.filter((a) => conversation.memberIds.includes(a.id))
    const queue = initialQueue(this.team, conversation, trigger.text)
    const turns = new Map<string, number>()
    let count = 0

    while (queue.length > 0 && count < MAX_AGENT_MESSAGES_PER_ROUND && !signal.aborted) {
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
        if (taken >= MAX_TURNS_PER_AGENT_PER_ROUND) continue
        if (queue.some((q) => q.id === m.id)) continue
        queue.push(m)
      }
    }
  }

  /** Runs one agent turn, streaming into a message. Returns the final text ('' if skipped/error). */
  private async turn(conversationId: string, agent: Agent, signal: AbortSignal): Promise<string> {
    const conversation = this.store.get(conversationId)
    if (!conversation) return ''
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

    const result = await runAgentTurn({
      team: this.team,
      conversation,
      agent,
      sessionId: conversation.sessions[agent.id],
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
        onSession: (sessionId) => {
          this.store.setSession(conversationId, agent.id, sessionId)
        },
      },
    })
    emit({ type: 'typing', conversationId, agentId: agent.id, on: false })

    if (result.error && /session|resume|not found|No conversation found/i.test(result.error) && conversation.sessions[agent.id]) {
      // The stored session is gone (e.g. transcript deleted). Forget it and retry once fresh.
      this.store.clearSession(conversationId, agent.id)
      if (!started) return this.turn(conversationId, agent, signal)
    }

    if (result.error) {
      start()
      const text = message.text.trim().length > 0 ? message.text : `⚠️ ${result.error}`
      const done = this.store.updateMessage(conversationId, message.id, { text, status: 'error' }) ?? { ...message, text, status: 'error' as const }
      emit({ type: 'message:done', message: done })
      return ''
    }

    if (result.text.length === 0) {
      // The agent chose to skip. Drop the placeholder if it was ever shown.
      if (started) {
        this.store.removeMessage(conversationId, message.id)
        emit({ type: 'message:remove', conversationId, messageId: message.id })
      }
      return ''
    }

    start()
    const done = this.store.updateMessage(conversationId, message.id, { text: result.text, status: 'done' }) ?? { ...message, text: result.text, status: 'done' as const }
    emit({ type: 'message:done', message: done })
    return result.text
  }
}
