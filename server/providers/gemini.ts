import { buildSystemPrompt, buildTurnPrompt, stripSkip } from '../prompt.js'
import { runCli } from './cli.js'
import { emptyUsage, type RunTurnParams, type TurnResult } from './types.js'

interface GeminiOutput {
  response?: string
  error?: { message?: string; type?: string } | string
  stats?: { models?: Record<string, { tokens?: { prompt?: number; candidates?: number; cached?: number; total?: number } }> }
}

function approvalMode(tools: string[], autoApprove: boolean): string {
  if (autoApprove) return 'yolo'
  return tools.some((t) => ['Edit', 'Write', 'Bash'].includes(t)) ? 'auto_edit' : 'default'
}

/**
 * Google Gemini CLI in headless mode. Signs in with your Google account (`gemini` once,
 * interactively) unless the provider has an API key. No resumable session: the transcript
 * carries the recent history each turn.
 */
export async function runGeminiTurn(params: RunTurnParams): Promise<TurnResult> {
  const { team, conversation, agent, provider, signal, handlers, note } = params
  const started = Date.now()
  const cwd = agent.cwd ?? team.workspace
  const args = ['--output-format', 'json', ...(agent.model && agent.model !== 'default' ? ['-m', agent.model] : []), '--approval-mode', approvalMode(agent.tools, agent.autoApproveTools || agent.permissionMode === 'bypassPermissions')]
  const stdin = `<system>\n${buildSystemPrompt(team, conversation, agent)}\n</system>\n\n${buildTurnPrompt(team, conversation, agent, false, note)}`

  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }
  if (provider.apiKey) env.GEMINI_API_KEY = provider.apiKey

  const run = await runCli('gemini', args, { cwd, env, stdin, signal })
  const usage = emptyUsage(agent.model)
  usage.durationMs = Date.now() - started
  if (run.aborted) return { text: '', error: 'Stopped.', usage }

  // The CLI may print banners before the JSON document; take the last top-level object.
  const jsonStart = run.stdout.lastIndexOf('\n{')
  const doc = jsonStart === -1 ? run.stdout.trim() : run.stdout.slice(jsonStart + 1).trim()
  let parsed: GeminiOutput | null = null
  try {
    parsed = JSON.parse(doc) as GeminiOutput
  } catch {
    parsed = null
  }

  if (!parsed) {
    const tail = (run.stderr || run.stdout).trim().split('\n').slice(-3).join(' ').trim()
    const hint = /login|auth|credential/i.test(tail) ? ' Run `gemini` once in a terminal to sign in with your Google account.' : ''
    return { text: '', error: (tail || `gemini exited with code ${run.exitCode}`) + hint, usage }
  }
  if (parsed.error) {
    const msg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message ?? 'Gemini reported an error.')
    return { text: '', error: msg, usage }
  }
  for (const m of Object.values(parsed.stats?.models ?? {})) {
    usage.inputTokens += m.tokens?.prompt ?? 0
    usage.outputTokens += m.tokens?.candidates ?? 0
    usage.cacheReadTokens += m.tokens?.cached ?? 0
  }
  const text = (parsed.response ?? '').trim()
  if (text) handlers.onDelta(text)
  return { text: stripSkip(text), usage }
}
