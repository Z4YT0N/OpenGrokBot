import type { RateLimitReport } from '../account.js'
import type { Agent, Conversation, MessageUsage, ProviderDef, Team } from '../../shared/types.js'

export interface TurnHandlers {
  onDelta: (text: string) => void
  onActivity: (line: string) => void
  onSession: (sessionId: string) => void
  onInit?: (authSource: string, version: string) => void
  onRateLimit?: (info: RateLimitReport) => void
  /** Ask the owner whether a tool call may run. Absent = everything allowed. */
  onToolPermission?: (tool: string, input: Record<string, unknown>) => Promise<boolean>
}

export interface TurnResult {
  text: string
  sessionId?: string
  error?: string
  usage?: MessageUsage
}

export interface RunTurnParams {
  team: Team
  conversation: Conversation
  agent: Agent
  provider: ProviderDef
  sessionId: string | undefined
  signal: AbortSignal
  handlers: TurnHandlers
  /** Optional dispatcher instruction appended to this turn (e.g. "build it now"). */
  note?: string
  /** The employee's long-term notes, injected into the system prompt. */
  notes?: string
}

export type ProviderRunner = (params: RunTurnParams) => Promise<TurnResult>

export function emptyUsage(model: string): MessageUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0, numTurns: 1, model }
}
