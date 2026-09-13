import { query } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk'
import { buildSystemPrompt, buildTurnPrompt, stripSkip } from '../prompt.js'
import type { RunTurnParams, TurnResult } from './types.js'
import type { Agent, Conversation, MessageUsage, ProviderDef, Team } from '../../shared/types.js'

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

function envFor(provider: ProviderDef): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    // Subscription by default: drop any globally exported key so you are never billed by accident.
    if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN') continue
    env[k] = v
  }
  if (provider.apiKey) env.ANTHROPIC_API_KEY = provider.apiKey
  if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl
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

export function buildQueryOptions(team: Team, conversation: Conversation, agent: Agent, provider: ProviderDef, sessionId: string | undefined, abort: AbortController): Options {
  const mcpServers = mcpServersFor(team, agent)
  const allowedTools = [...agent.tools, ...Object.keys(mcpServers).map((n) => `mcp__${n}`)]
  const mcpNote = agent.mcpServers.length > 0 ? ` You also have MCP tools from: ${agent.mcpServers.join(', ')}.` : ''
  const options: Options = {
    model: agent.model,
    effort: agent.effort,
    systemPrompt: buildSystemPrompt(team, conversation, agent, mcpNote),
    cwd: agent.cwd ?? team.workspace,
    tools: agent.tools,
    allowedTools,
    permissionMode: agent.permissionMode,
    includePartialMessages: true,
    settingSources: agent.inheritClaudeSettings ? ['user'] : [],
    maxTurns: team.settings.maxTurnsPerReply,
    env: envFor(provider),
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

export async function runClaudeTurn(params: RunTurnParams): Promise<TurnResult> {
  const { team, conversation, agent, provider, sessionId, signal, handlers } = params
  const abort = new AbortController()
  const onAbort = (): void => abort.abort()
  if (signal.aborted) abort.abort()
  else signal.addEventListener('abort', onAbort, { once: true })

  const prompt = buildTurnPrompt(team, conversation, agent, sessionId !== undefined)
  const q = query({ prompt, options: buildQueryOptions(team, conversation, agent, provider, sessionId, abort) })

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
  const out: TurnResult = { text: error ? finalText : stripSkip(finalText) }
  if (error) out.error = error
  if (session) out.sessionId = session
  if (usage) out.usage = usage
  return out
}
