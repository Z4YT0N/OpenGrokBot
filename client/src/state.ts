import type { AccountStatus, AppState, Conversation, Message, ServerEvent, Team, UsageSummary } from '../../shared/types'

export interface UiState {
  team: Team | null
  conversations: Conversation[]
  busy: Set<string>
  typing: Map<string, Set<string>>
  connected: boolean
  usage: UsageSummary
  account: AccountStatus
}

export type Action =
  | { type: 'state'; state: AppState }
  | { type: 'event'; event: ServerEvent }
  | { type: 'connected'; connected: boolean }

const emptyTotals = { messages: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 }

export const initialState: UiState = {
  team: null,
  conversations: [],
  busy: new Set(),
  typing: new Map(),
  connected: false,
  usage: { byAgent: {}, byConversation: {}, byModel: {}, total: emptyTotals },
  account: { windows: {} },
}

function patchConversation(state: UiState, id: string, fn: (c: Conversation) => Conversation): UiState {
  return { ...state, conversations: state.conversations.map((c) => (c.id === id ? fn(c) : c)) }
}

function upsert(messages: Message[], message: Message): Message[] {
  const i = messages.findIndex((m) => m.id === message.id)
  if (i === -1) return [...messages, message]
  const next = messages.slice()
  next[i] = message
  return next
}

export function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: action.connected }
    case 'state':
      return {
        ...state,
        team: action.state.team,
        conversations: action.state.conversations,
        busy: new Set(action.state.busy),
        usage: action.state.usage,
        account: action.state.account,
      }
    case 'event': {
      const ev = action.event
      switch (ev.type) {
        case 'message:start':
        case 'message:done':
          return patchConversation(state, ev.message.conversationId, (c) => ({ ...c, messages: upsert(c.messages, ev.message) }))
        case 'message:delta':
          return patchConversation(state, ev.conversationId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === ev.messageId ? { ...m, text: m.text + ev.delta } : m)),
          }))
        case 'message:activity':
          return patchConversation(state, ev.conversationId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === ev.messageId ? { ...m, activity: [...(m.activity ?? []), ev.line] } : m)),
          }))
        case 'message:remove':
          return patchConversation(state, ev.conversationId, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== ev.messageId) }))
        case 'typing': {
          const typing = new Map(state.typing)
          const set = new Set(typing.get(ev.conversationId) ?? [])
          if (ev.on) set.add(ev.agentId)
          else set.delete(ev.agentId)
          typing.set(ev.conversationId, set)
          return { ...state, typing }
        }
        case 'round': {
          const busy = new Set(state.busy)
          if (ev.running) busy.add(ev.conversationId)
          else busy.delete(ev.conversationId)
          const typing = new Map(state.typing)
          if (!ev.running) typing.set(ev.conversationId, new Set())
          return { ...state, busy, typing }
        }
        case 'usage':
          return { ...state, usage: ev.usage }
        case 'account':
          return { ...state, account: ev.account }
        case 'team':
          return { ...state, team: ev.team, conversations: ev.conversations }
        default:
          return state
      }
    }
    default:
      return state
  }
}
