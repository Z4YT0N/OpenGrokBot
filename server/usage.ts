import type { Conversation, UsageSummary, UsageTotals } from '../shared/types.js'

function empty(): UsageTotals {
  return { messages: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 }
}

function add(into: Record<string, UsageTotals>, key: string, u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number }): void {
  const t = into[key] ?? (into[key] = empty())
  t.messages++
  t.inputTokens += u.inputTokens
  t.outputTokens += u.outputTokens
  t.cacheReadTokens += u.cacheReadTokens
  t.cacheCreationTokens += u.cacheCreationTokens
  t.costUsd += u.costUsd
}

/** Sums the usage recorded on every employee message. Cheap enough to recompute on demand. */
export function summarizeUsage(conversations: Conversation[]): UsageSummary {
  const byAgent: Record<string, UsageTotals> = {}
  const byConversation: Record<string, UsageTotals> = {}
  const byModel: Record<string, UsageTotals> = {}
  const totalMap: Record<string, UsageTotals> = {}
  for (const c of conversations) {
    for (const m of c.messages) {
      if (!m.usage) continue
      add(byAgent, m.authorId, m.usage)
      add(byConversation, c.id, m.usage)
      add(byModel, m.usage.model, m.usage)
      add(totalMap, 'all', m.usage)
    }
    for (const s of c.silent ?? []) {
      add(byAgent, s.agentId, s.usage)
      add(byConversation, c.id, s.usage)
      add(byModel, s.usage.model, s.usage)
      add(totalMap, 'all', s.usage)
    }
  }
  return { byAgent, byConversation, byModel, total: totalMap.all ?? empty() }
}
