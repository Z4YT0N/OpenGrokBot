import { cliVersion, runCli } from './cli.js'
import { runClaudeTurn } from './claude.js'
import { runCodexTurn } from './codex.js'
import { runGeminiTurn } from './gemini.js'
import { listOpenAiModels, runOpenAiTurn } from './openai.js'
import type { ProviderRunner, RunTurnParams, TurnResult } from './types.js'
import type { ProviderDef, ProviderKind, ProviderStatus, Team } from '../../shared/types.js'

const RUNNERS: Record<ProviderKind, ProviderRunner> = {
  claude: runClaudeTurn,
  codex: runCodexTurn,
  gemini: runGeminiTurn,
  openai: runOpenAiTurn,
}

/** Providers whose CLI keeps a resumable session id. */
export function providerKeepsSession(kind: ProviderKind): boolean {
  return kind === 'claude' || kind === 'codex'
}

export function runProviderTurn(params: RunTurnParams): Promise<TurnResult> {
  return RUNNERS[params.provider.kind](params)
}

const statusCache = new Map<string, { at: number; value: ProviderStatus }>()

async function probe(id: string, def: ProviderDef): Promise<ProviderStatus> {
  const base = { id, kind: def.kind }
  try {
    switch (def.kind) {
      case 'claude': {
        const v = await cliVersion('claude')
        if (!v) return { ...base, ok: false, detail: 'Claude Code CLI not found. Install: npm i -g @anthropic-ai/claude-code, then `claude` to sign in.' }
        return { ...base, ok: true, detail: def.apiKey ? `${v} · API key (billed per token)` : `${v} · subscription login` }
      }
      case 'codex': {
        const v = await cliVersion('codex')
        if (!v) return { ...base, ok: false, detail: 'Codex CLI not found. Install: npm i -g @openai/codex, then `codex login`.' }
        if (def.apiKey) return { ...base, ok: true, detail: `${v} · API key` }
        const login = await runCli('codex', ['login', 'status'], { cwd: process.cwd(), env: process.env, stdin: '', signal: AbortSignal.timeout(15_000) })
        const line = `${login.stdout}${login.stderr}`.trim().split('\n')[0] ?? ''
        const ok = login.exitCode === 0 && /logged in/i.test(line) && !/not logged in/i.test(line)
        return { ...base, ok, detail: ok ? `${v} · ${line}` : `${v} · not logged in. Run \`codex login\` in a terminal.` }
      }
      case 'gemini': {
        const v = await cliVersion('gemini')
        if (!v) return { ...base, ok: false, detail: 'Gemini CLI not found. Install: npm i -g @google/gemini-cli, then run `gemini` once to sign in with Google.' }
        return { ...base, ok: true, detail: def.apiKey ? `${v} · API key` : `${v} · Google account login` }
      }
      case 'openai': {
        if (!def.baseUrl) return { ...base, ok: false, detail: 'No base URL.' }
        const models = await listOpenAiModels(def.baseUrl, def.apiKey)
        return { ...base, ok: true, detail: `${models.length} models available`, models }
      }
    }
  } catch (err) {
    return { ...base, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function providerStatuses(team: Team, force = false): Promise<ProviderStatus[]> {
  const out: ProviderStatus[] = []
  for (const [id, def] of Object.entries(team.providers)) {
    const key = `${id}:${def.kind}:${def.baseUrl ?? ''}:${def.apiKey ? 'key' : 'nokey'}`
    const cached = statusCache.get(key)
    if (!force && cached && Date.now() - cached.at < 60_000) {
      out.push(cached.value)
      continue
    }
    const value = await probe(id, def)
    statusCache.set(key, { at: Date.now(), value })
    out.push(value)
  }
  return out
}
