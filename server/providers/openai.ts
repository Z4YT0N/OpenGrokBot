import { buildSystemPrompt, buildTurnPrompt, stripSkip } from '../prompt.js'
import { LOCAL_TOOLS, runLocalTool, summarizeLocalTool } from './localtools.js'
import { emptyUsage, type RunTurnParams, type TurnResult } from './types.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
  error?: { message?: string }
}

/**
 * Any OpenAI-compatible chat API (Kimi, OpenRouter, DeepSeek, Groq, xAI, Ollama…). Streams the
 * reply and runs a small tool loop with local file/shell tools when the employee has tools.
 */
export async function runOpenAiTurn(params: RunTurnParams): Promise<TurnResult> {
  const { team, conversation, agent, provider, signal, handlers, note } = params
  const started = Date.now()
  const cwd = agent.cwd ?? team.workspace
  const allowOutside = agent.autoApproveTools || agent.permissionMode === 'bypassPermissions'
  const tools = LOCAL_TOOLS.filter((t) => agent.tools.includes(t.claudeName))
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(team, conversation, agent) },
    { role: 'user', content: buildTurnPrompt(team, conversation, agent, false, note) },
  ]
  const usage = emptyUsage(agent.model)
  usage.numTurns = 0
  let text = ''
  let sawAnyText = false

  for (let turn = 0; turn < Math.max(1, team.settings.maxTurnsPerReply); turn++) {
    if (signal.aborted) return { text: text.trim(), error: 'Stopped.', usage }
    usage.numTurns++
    const body: Record<string, unknown> = {
      model: agent.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (tools.length > 0) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))

    let res: Response
    try {
      res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey ?? 'none'}`, 'HTTP-Referer': 'https://github.com/Z4YT0N/OpenGrokBot', 'X-Title': 'OpenGrokBot' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      return { text: text.trim(), error: signal.aborted ? 'Stopped.' : `Could not reach ${provider.baseUrl}: ${err instanceof Error ? err.message : String(err)}`, usage }
    }
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => '')).slice(0, 400)
      return { text: text.trim(), error: `${provider.label} returned HTTP ${res.status}: ${detail}`, usage }
    }

    const calls = new Map<number, ToolCall>()
    let turnText = ''
    let finish: string | null = null
    let streamError: string | undefined
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue
        let chunk: StreamChunk
        try {
          chunk = JSON.parse(payload) as StreamChunk
        } catch {
          continue
        }
        if (chunk.error?.message) streamError = chunk.error.message
        if (chunk.usage) {
          usage.inputTokens += chunk.usage.prompt_tokens ?? 0
          usage.outputTokens += chunk.usage.completion_tokens ?? 0
          usage.cacheReadTokens += chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
        }
        const choice = chunk.choices?.[0]
        if (!choice) continue
        if (choice.delta?.content) {
          if (!sawAnyText && text.length > 0) {
            text += '\n\n'
            handlers.onDelta('\n\n')
          }
          sawAnyText = true
          turnText += choice.delta.content
          text += choice.delta.content
          handlers.onDelta(choice.delta.content)
        }
        for (const tc of choice.delta?.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, type: 'function', function: { name: '', arguments: '' } }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.function.name += tc.function.name
          if (tc.function?.arguments) cur.function.arguments += tc.function.arguments
          calls.set(tc.index, cur)
        }
        if (choice.finish_reason) finish = choice.finish_reason
      }
    }
    if (streamError) return { text: text.trim(), error: streamError, usage }

    if (calls.size === 0 || finish === 'stop') {
      usage.durationMs = Date.now() - started
      return { text: stripSkip(text), usage }
    }

    // Tool round: run every call, feed results back, and let the model continue.
    const toolCalls = [...calls.values()]
    messages.push({ role: 'assistant', content: turnText || null, tool_calls: toolCalls })
    sawAnyText = false
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      handlers.onActivity(summarizeLocalTool(call.function.name, args))
      let result: string
      try {
        result = await runLocalTool(call.function.name, args, cwd, allowOutside, signal)
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.slice(0, 60_000) })
    }
  }
  usage.durationMs = Date.now() - started
  return { text: stripSkip(text), usage, error: text.trim() ? undefined : 'Ran out of tool steps before answering.' }
}

/** Lists models from an OpenAI-compatible endpoint, for the provider status page. */
export async function listOpenAiModels(baseUrl: string, apiKey: string | undefined): Promise<string[]> {
  const res = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey ?? 'none'}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { data?: { id?: string }[] }
  return (data.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string').sort()
}
