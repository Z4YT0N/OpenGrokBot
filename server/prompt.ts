import type { Agent, Conversation, Team } from '../shared/types.js'

export const SKIP_TOKEN = '[skip]'

function roster(team: Team, conversation: Conversation, self: Agent): string {
  const lines = conversation.memberIds.map((id) => {
    if (id === 'user') return `- ${team.owner.name} (${team.owner.title}, the boss)`
    const a = team.agents.find((x) => x.id === id)
    if (!a) return null
    return `- ${a.name} (${a.role})${a.id === self.id ? ' — this is you' : ''}`
  })
  return lines.filter((l): l is string => l !== null).join('\n')
}

function languageRule(team: Team): string {
  switch (team.settings.language) {
    case 'ar':
      return `- Language: always write natural colloquial Egyptian Arabic (not formal Modern Standard Arabic). Keep technical terms, product names and code in English.`
    case 'en':
      return `- Language: always write English, even if ${team.owner.name} writes Arabic.`
    default:
      return `- Language: answer in the language ${team.owner.name} writes in. If he writes Arabic, write natural colloquial Egyptian Arabic (not formal Modern Standard Arabic) and keep technical terms, product names and code in English. Colleagues follow the same rule.`
  }
}

/** Describes the tools an employee has, in provider-neutral words. */
export function toolsNote(agent: Agent, extra = ''): string {
  const hasWorkTools = agent.tools.some((t) => ['Edit', 'Write', 'Bash'].includes(t))
  if (hasWorkTools) {
    return `\nYou have real tools (${agent.tools.join(', ')}) and a working directory.${extra} When work is asked of you, actually do it with the tools before answering, then report what you did in the chat message. Never claim you changed something you did not change.`
  }
  if (agent.tools.length > 0 || extra) {
    return `\nYou have read-only tools (${agent.tools.join(', ') || 'none built in'}).${extra} Use them when a question needs facts from the code, the web or a connected service, then answer in the chat.`
  }
  return ''
}

export function buildSystemPrompt(team: Team, conversation: Conversation, agent: Agent, extraToolsNote = ''): string {
  const place = conversation.kind === 'group' ? `the "${conversation.name}" group chat` : `a private direct-message chat with ${team.owner.name}`
  const other = team.agents.find((a) => a.id !== agent.id)?.name ?? 'NAME'
  const boss = team.owner.name.split(/\s+/)[0] ?? team.owner.name
  return `${agent.personality}

You work at ${team.company}. You are chatting in ${place}. Members:
${roster(team, conversation, agent)}

Chat protocol:
- The user turn you receive is a transcript of the messages posted since you last spoke, each prefixed with the author's name in brackets. Reply as ${agent.name}, in first person, with the text of ONE chat message only. No name prefix, no quotes around it, no headers.
- Write like a real colleague in a team chat: natural, specific, short by default (one to six sentences). Go longer only when someone asks for detail, a plan, or code.
- To address a colleague, mention them exactly as @NAME using their name as listed above (for example @${other}). Mentioning a colleague asks them to respond, so mention only when you want their input or are handing something to them. To address the boss, write @${boss}.
- Disagree when you disagree; give reasons. Do not just agree with the previous message.
${languageRule(team)}
- If the latest messages need nothing from you (for example, they were addressed to someone else and you have nothing to add), reply with exactly ${SKIP_TOKEN} and nothing else.
- Markdown is fine for code blocks and short lists. Never wrap your whole message in a code block.${toolsNote(agent, extraToolsNote)}`
}

function lastIndexOfOwnMessage(conversation: Conversation, agentId: string): number {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i]
    if (m && m.authorId === agentId && m.status === 'done') return i
  }
  return -1
}

/**
 * The transcript an employee sees for this turn.
 * With a resumable session: only what was said since they last spoke (their memory has the rest).
 * Without one: the recent transcript including their own earlier messages, marked "(you)".
 */
export function buildTurnPrompt(team: Team, conversation: Conversation, agent: Agent, hasSession: boolean): string {
  const names = new Map<string, string>([['user', team.owner.name]])
  for (const a of team.agents) names.set(a.id, a.name)
  const since = hasSession ? lastIndexOfOwnMessage(conversation, agent.id) : -1
  const fresh = conversation.messages
    .slice(since + 1)
    .filter((m) => m.status === 'done' && m.text.trim().length > 0 && (hasSession ? m.authorId !== agent.id : true))
  const window = fresh.slice(-40)
  const skipped = fresh.length - window.length
  const lines = window.map((m) => `[${names.get(m.authorId) ?? m.authorId}${m.authorId === agent.id ? ' (you)' : ''}]: ${m.text}`)
  const head = skipped > 0 ? `(${skipped} earlier messages omitted)\n` : ''
  return `${head}${lines.join('\n\n')}\n\n(Reply now as ${agent.name}.)`
}

export function stripSkip(text: string): string {
  const t = text.trim()
  return t === SKIP_TOKEN ? '' : t
}
