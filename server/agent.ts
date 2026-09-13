import { query } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk'
import type { RateLimitReport } from './account.js'
import type { Agent, Conversation, Message, MessageUsage, Team } from '../shared/types.js'

export interface TurnHandlers {
  onDelta: (text: string) => void
  onActivity: (line: string) => void
  onSession: (sessionId: string) => void
  onInit?: (authSource: string, version: string) => void
  onRateLimit?: (info: RateLimitReport) => void
}

export interface TurnResult {
  text: string
  sessionId?: string
  error?: string
  usage?: MessageUsage
}

const SKIP_TOKEN = '[skip]'

function roster(team: Team, conversation: Conversation, self: Agent): string {
  const lines = conversation.memberIds.map((id) => {
    if (id === 'user') return `- ${team.owner.name} (${team.owner.title}, the boss)`
    const a = team.agents.find((x) => x.id === id)
    if (!a) return null
    return `- ${a.name} (${a.role})${a.id === self.id ? ' — this is you' : ''}`
  })
  return lines.filter((l): l is string => l !== null).join('\n')
}

export function buildSystemPrompt(team: Team, conversation: Conversation, agent: Agent): string {
  const place = conversation.kind === 'group' ? `the "${conversation.name}" group chat` : `a private direct-message chat with ${team.owner.name}`
  const hasWorkTools = agent.tools.some((t) => ['Edit', 'Write', 'Bash'].includes(t))
  const mcp = agent.mcpServers.length > 0 ? ` You also have MCP tools from: ${agent.mcpServers.join(', ')}.` : ''
  const work = hasWorkTools
    ? `\nYou have real tools (${agent.tools.join(', ')}) and a working directory.${mcp} When work is asked of you, actually do it with the tools before answering, then report what you did in the chat message. Never claim you changed something you did not change.`
    : agent.tools.length > 0 || agent.mcpServers.length > 0
      ? `\nYou have read-only tools (${agent.tools.join(', ') || 'none built in'}).${mcp} Use them when a question needs facts from the code, the web or a connected service, then answer in the chat.`
      : ''
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
- Language: answer in the language ${team.owner.name} writes in. He usually writes Egyptian Arabic; when he does, write natural colloquial Egyptian Arabic (not formal Modern Standard Arabic) and keep technical terms, product names and code in English. Colleagues follow the same rule.
- If the latest messages need nothing from you (for example, they were addressed to someone else and you have nothing to add), reply with exactly ${SKIP_TOKEN} and nothing else.
- Markdown is fine for code blocks and short lists. Never wrap your whole message in a code block.${work}`
}

function lastIndexOfOwnMessage(conversation: Conversation, agentId: string): number {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i]
    if (m && m.authorId === agentId && m.status === 'done') return i
  }
  return -1
}

export function buildTurnPrompt(team: Team, conversation: Conversation, agent: Agent, hasSession: boolean): string {
  const names = new Map<string, string>([['user', team.owner.name]])
  for (const a of team.agents) names.set(a.id, a.name)
  const since = hasSession ? lastIndexOfOwnMessage(conversation, agent.id) : -1
  const fresh = conversation.messages
    .slice(since + 1)
    .filter((m) => m.status === 'done' && m.text.trim().length > 0 && m.authorId !== agent.id)
  const window = fresh.slice(-40)
  const skipped = fresh.length - window.length
  const lines = window.map((m) => `[${names.get(m.authorId) ?? m.authorId}]: ${m.text}`)
  const head = skipped > 0 ? `(${skipped} earlier messages omitted)\n` : ''
  return `${head}${lines.join('\n\n')}\n\n(Reply now as ${agent.name}.)`
}

function summarizeToolUse(name: string, input: unknown): string {
  const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const str = (k: string): string | undefined => (typeof i[k] === 'string' ? (i[k] as string) : undefined)
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return `${name} ${str('file_path') ?? ''}`.trim()
    case 'Bash':
      return `Bash ${str('description') ?? str('command') ?? ''}`.trim()
    case 'Glob':
    case 'Grep':
      return `${name} ${str('pattern') ?? ''}`.trim()
    case 'WebSearch':
      return `Searching the web: ${str('query') ?? ''}`.trim()
    case 'WebFetch':
      return `Fetching ${str('url') ?? ''}`.trim()
    case 'Task':
      return `Subagent: ${str('description') ?? ''}`.trim()
    default: {
      const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name)
      return m ? `${m[1]} → ${m[2]}` : name
    }
  }
}

function envForSubscription(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    // Force the Claude Code login (subscription) path even if a key is exported globally.
    if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN') continue
    env[k] = v
  }
  return env
}

function mcpServersFor(team: Team, agent: Agent): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}
  for (const name of agent.mcpServers) {
    const def = team.mcpServers[name]
    if (!def) continue
    if (def.type === 'stdio') {
      out[name] = { type: 'stdio', command: def.command, ...(def.args ? { args: def.args } : {}), ...(def.env ? { env: def.env } : {}) }
    } else {
      out[name] = { type: def.type, url: def.url, ...(def.headers ? { headers: def.headers } : {}) }
    }
  }
  return out
}

export function buildQueryOptions(team: Team, conversation: Conversation, agent: Agent, sessionId: string | undefined, abort: AbortController): Options {
  const mcpServers = mcpServersFor(team, agent)
  const allowedTools = [...agent.tools, ...Object.keys(mcpServers).map((n) => `mcp__${n}`)]
  const options: Options = {
    model: agent.model,
    effort: agent.effort,
    systemPrompt: buildSystemPrompt(team, conversation, agent),
    cwd: agent.cwd ?? team.workspace,
    tools: agent.tools,
    allowedTools,
    permissionMode: agent.permissionMode,
    includePartialMessages: true,
    settingSources: agent.inheritClaudeSettings ? ['user'] : [],
    maxTurns: team.settings.maxTurnsPerReply,
    env: envForSubscription(),
    abortController: abort,
  }
  if (Object.keys(mcpServers).length > 0) options.mcpServers = mcpServers
  if (sessionId) options.resume = sessionId
  if (agent.autoApproveTools) {
    options.canUseTool = async (_tool, input) => ({ behavior: 'allow', updatedInput: input })
  }
  if (agent.permissionMode === 'bypassPermissions') options.allowDangerouslySkipPermissions = true
  return options
}

export interface RunTurnParams {
  team: Team
  conversation: Conversation
  agent: Agent
  sessionId: string | undefined
  signal: AbortSignal
  handlers: TurnHandlers
}

/** Runs one chat turn for one employee. Returns the final message text ('' when the agent chose to skip). */
export async function runAgentTurn(params: RunTurnParams): Promise<TurnResult> {
  const { team, conversation, agent, sessionId, signal, handlers } = params
  const abort = new AbortController()
  const onAbort = (): void => abort.abort()
  if (signal.aborted) abort.abort()
  else signal.addEventListener('abort', onAbort, { once: true })

  const prompt = buildTurnPrompt(team, conversation, agent, sessionId !== undefined)
  const q = query({ prompt, options: buildQueryOptions(team, conversation, agent, sessionId, abort) })

  let text = ''
  let resultText = ''
  let error: string | undefined
  let session: string | undefined
  let usage: MessageUsage | undefined
  let blockOpen = false

  try {
    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        session = msg.session_id
        handlers.onSession(session)
        handlers.onInit?.(String(msg.apiKeySource), msg.claude_code_version)
      } else if (msg.type === 'rate_limit_event') {
        const info = msg.rate_limit_info
        handlers.onRateLimit?.({ status: info.status, rateLimitType: info.rateLimitType, utilization: info.utilization, resetsAt: info.resetsAt })
      } else if (msg.type === 'stream_event') {
        if (msg.parent_tool_use_id) continue
        const ev = msg.event
        if (ev.type === 'content_block_start' && ev.content_block.type === 'text') {
          if (text.length > 0 && !text.endsWith('\n\n')) {
            text += '\n\n'
            handlers.onDelta('\n\n')
          }
          blockOpen = true
        } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && blockOpen) {
          text += ev.delta.text
          handlers.onDelta(ev.delta.text)
        } else if (ev.type === 'content_block_stop') {
          blockOpen = false
        }
      } else if (msg.type === 'assistant') {
        if (msg.parent_tool_use_id) continue
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') handlers.onActivity(summarizeToolUse(block.name, block.input))
        }
      } else if (msg.type === 'result') {
        const models = Object.keys(msg.modelUsage ?? {})
        usage = {
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          cacheReadTokens: msg.usage.cache_read_input_tokens,
          cacheCreationTokens: msg.usage.cache_creation_input_tokens,
          costUsd: msg.total_cost_usd,
          durationMs: msg.duration_ms,
          numTurns: msg.num_turns,
          model: models.length > 0 ? models.join('+') : agent.model,
        }
        if (msg.subtype === 'success') {
          resultText = msg.result
        } else {
          error = msg.subtype === 'error_during_execution' ? 'The agent hit an error while working.' : `Turn ended: ${msg.subtype}`
          const errs = (msg as { errors?: string[] }).errors
          if (Array.isArray(errs) && errs.length > 0) error = errs.join('\n')
        }
      }
    }
  } catch (err) {
    if (abort.signal.aborted) error = 'Stopped.'
    else error = err instanceof Error ? err.message : String(err)
  } finally {
    signal.removeEventListener('abort', onAbort)
  }

  const finalText = (text.trim().length > 0 ? text : resultText).trim()
  const out: TurnResult = { text: error ? finalText : finalText === SKIP_TOKEN ? '' : finalText }
  if (error) out.error = error
  if (session) out.sessionId = session
  if (usage) out.usage = usage
  return out
}

export function isSkip(m: Message): boolean {
  return m.text.trim() === SKIP_TOKEN || m.text.trim().length === 0
}
