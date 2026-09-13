import type { Agent } from '../shared/types.js'

/**
 * Find agents mentioned as @NAME (case-insensitive) in `text`, in order of first
 * appearance. `@` followed by the agent's display name; names may contain spaces
 * in team.json, so we match the longest name first.
 */
export function findMentions(text: string, agents: Agent[], exclude?: string): Agent[] {
  const found: { index: number; agent: Agent }[] = []
  const sorted = [...agents].sort((a, b) => b.name.length - a.name.length)
  const lower = text.toLowerCase()
  for (const agent of sorted) {
    if (agent.id === exclude) continue
    const needle = `@${agent.name.toLowerCase()}`
    let from = 0
    for (;;) {
      const i = lower.indexOf(needle, from)
      if (i === -1) break
      const after = lower[i + needle.length]
      const boundary = after === undefined || !/[a-z0-9_]/.test(after)
      if (boundary && !found.some((f) => f.agent.id === agent.id)) {
        found.push({ index: i, agent })
      }
      from = i + needle.length
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.agent)
}
