import { buildSystemPrompt, buildTurnPrompt, stripSkip } from '../prompt.js'
import { runCli } from './cli.js'
import { emptyUsage, type RunTurnParams, type TurnResult } from './types.js'

const EFFORT: Record<string, string> = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'xhigh' }

interface CodexEvent {
  type: string
  thread_id?: string
  item?: { type: string; text?: string; command?: string; changes?: unknown[]; query?: string; status?: string }
  usage?: { input_tokens?: number; cached_input_tokens?: number; cache_write_input_tokens?: number; output_tokens?: number }
  error?: { message?: string }
  message?: string
}

function sandboxFor(tools: string[], autoApprove: boolean): string {
  if (autoApprove) return 'danger-full-access'
  return tools.some((t) => ['Edit', 'Write', 'Bash'].includes(t)) ? 'workspace-write' : 'read-only'
}

/** OpenAI Codex CLI in headless mode. Uses `codex login` (ChatGPT subscription) unless the provider has an API key. */
export async function runCodexTurn(params: RunTurnParams): Promise<TurnResult> {
  const { team, conversation, agent, provider, sessionId, signal, handlers, note } = params
  const started = Date.now()
  const cwd = agent.cwd ?? team.workspace
  const common = ['--json', '--skip-git-repo-check', '-C', cwd, ...(agent.model && agent.model !== 'default' ? ['-m', agent.model] : []), '-s', sandboxFor(agent.tools, agent.autoApproveTools || agent.permissionMode === 'bypassPermissions'), '-c', `model_reasoning_effort="${EFFORT[agent.effort] ?? 'medium'}"`]
  if (agent.autoApproveTools || agent.permissionMode === 'bypassPermissions') common.push('--dangerously-bypass-approvals-and-sandbox')
  const args = sessionId ? ['exec', ...common, 'resume', sessionId, '-'] : ['exec', ...common, '-']

  // Codex has no system-prompt flag: the persona rides in the first prompt of the thread.
  const transcript = buildTurnPrompt(team, conversation, agent, sessionId !== undefined, note)
  const stdin = sessionId ? transcript : `<system>\n${buildSystemPrompt(team, conversation, agent)}\n</system>\n\n${transcript}`

  const env: NodeJS.ProcessEnv = { ...process.env }
  if (provider.apiKey) env.OPENAI_API_KEY = provider.apiKey
  else delete env.OPENAI_API_KEY

  let text = ''
  let session: string | undefined
  let error: string | undefined
  const usage = emptyUsage(agent.model)

  const run = await runCli('codex', args, {
    cwd,
    env,
    stdin,
    signal,
    onLine: (line) => {
      if (!line.startsWith('{')) return
      let ev: CodexEvent
      try {
        ev = JSON.parse(line) as CodexEvent
      } catch {
        return
      }
      if (ev.type === 'thread.started' && ev.thread_id) {
        session = ev.thread_id
        handlers.onSession(session)
      } else if (ev.type === 'item.completed' && ev.item) {
        const item = ev.item
        if (item.type === 'agent_message' && item.text) {
          const chunk = (text.length > 0 ? '\n\n' : '') + item.text
          text += chunk
          handlers.onDelta(chunk)
        } else if (item.type === 'command_execution' && item.command) {
          handlers.onActivity(`Bash ${item.command}`.slice(0, 160))
        } else if (item.type === 'file_change') {
          handlers.onActivity(`Edited ${Array.isArray(item.changes) ? item.changes.length : ''} file(s)`.trim())
        } else if (item.type === 'web_search' && item.query) {
          handlers.onActivity(`Searching the web: ${item.query}`)
        }
      } else if (ev.type === 'item.started' && ev.item?.type === 'command_execution' && ev.item.command) {
        handlers.onActivity(`Bash ${ev.item.command}`.slice(0, 160))
      } else if (ev.type === 'turn.completed' && ev.usage) {
        usage.inputTokens = ev.usage.input_tokens ?? 0
        usage.cacheReadTokens = ev.usage.cached_input_tokens ?? 0
        usage.cacheCreationTokens = ev.usage.cache_write_input_tokens ?? 0
        usage.outputTokens = ev.usage.output_tokens ?? 0
      } else if (ev.type === 'turn.failed' || ev.type === 'error') {
        error = ev.error?.message ?? ev.message ?? 'Codex reported an error.'
      }
    },
  })

  usage.durationMs = Date.now() - started
  if (run.aborted) error = 'Stopped.'
  else if (run.exitCode !== 0 && !error) {
    const tail = run.stderr.trim().split('\n').slice(-3).join(' ').trim()
    error = tail || `codex exited with code ${run.exitCode}`
    if (/not logged in|login|auth/i.test(tail) && !/logged in using/i.test(tail)) error = `Codex is not logged in. Run \`codex login\` in a terminal. (${tail})`
  }

  const out: TurnResult = { text: error ? text.trim() : stripSkip(text), usage }
  if (error) out.error = error
  if (session) out.sessionId = session
  return out
}
