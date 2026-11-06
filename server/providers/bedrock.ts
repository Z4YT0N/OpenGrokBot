import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { needsApproval } from '../approvals.js'
import { buildSystemPrompt, buildTurnPrompt, stripSkip } from '../prompt.js'
import { runCli } from './cli.js'
import { LOCAL_TOOLS, runLocalTool, summarizeLocalTool } from './localtools.js'
import { emptyUsage, type RunTurnParams, type TurnResult } from './types.js'

interface BedrockBlock {
  text?: string
  toolUse?: { toolUseId: string; name: string; input: Record<string, unknown> }
}
interface BedrockReply {
  output?: { message?: { role: 'assistant'; content: BedrockBlock[] } }
  stopReason?: string
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheWriteInputTokens?: number }
}

/** Bedrock Converse output is stable across providers; do not mistake a tool request for text. */
export function parseBedrockReply(output: string): BedrockReply {
  const value = JSON.parse(output) as BedrockReply
  if (!value.output?.message || !Array.isArray(value.output.message.content)) {
    throw new Error('Bedrock returned an invalid Converse response')
  }
  return value
}

function regionFor(value?: string): string {
  const region = value || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  if (!region || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(region)) {
    throw new Error('Set a valid AWS region in the provider or AWS_REGION')
  }
  return region
}

/**
 * AWS CLI v2 owns the credential chain (SSO, profiles, environment, assumed roles).
 * The request is passed through an owner-only temporary file, not shell arguments.
 * No AWS keys, model prompts, or transcript data are printed to application logs.
 */
export async function runBedrockTurn(params: RunTurnParams): Promise<TurnResult> {
  const { team, conversation, agent, provider, signal, handlers, note, notes } = params
  const started = Date.now()
  const usage = emptyUsage(agent.model)
  usage.numTurns = 0
  let text = ''
  let region: string
  try {
    region = regionFor(provider.awsRegion)
  } catch (err) {
    return { text: '', error: String(err instanceof Error ? err.message : err), usage }
  }
  const cwd = agent.cwd ?? team.workspace
  const tools = LOCAL_TOOLS.filter((t) => agent.tools.includes(t.claudeName))
  const messages: { role: string; content: Record<string, unknown>[] }[] = [
    { role: 'user', content: [{ text: buildTurnPrompt(team, conversation, agent, false, note) }] },
  ]
  const system = [{ text: buildSystemPrompt(team, conversation, agent, '', notes ?? '') }]
  const allowOutside = agent.autoApproveTools || agent.permissionMode === 'bypassPermissions'
  for (let n = 0; n < Math.max(1, team.settings.maxTurnsPerReply); n++) {
    if (signal.aborted) return { text: text.trim(), error: 'Stopped.', usage }
    usage.numTurns++
    const input: Record<string, unknown> = { modelId: agent.model, messages, system }
    if (tools.length > 0) {
      input.toolConfig = { tools: tools.map((t) => ({ toolSpec: {
        name: t.name, description: t.description, inputSchema: { json: t.parameters },
      } })) }
    }
    // The CLI accepts JSON via file://; prompts are never interpolated into a shell.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'opengrokbot-bedrock-'))
    const file = path.join(dir, 'input.json')
    let run
    try {
      writeFileSync(file, JSON.stringify(input), { mode: 0o600 })
      const args = ['bedrock-runtime', 'converse', '--region', region, '--no-cli-pager', '--output', 'json',
        ...(provider.awsProfile ? ['--profile', provider.awsProfile] : []), '--cli-input-json', 'file://' + file]
      run = await runCli('aws', args, { cwd, env: { ...process.env, AWS_PAGER: '' }, stdin: '', signal })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    if (run.aborted || signal.aborted) return { text: text.trim(), error: 'Stopped.', usage }
    if (run.exitCode !== 0) {
      const detail = run.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500)
      return { text: text.trim(), error: detail || 'AWS CLI failed. Check AWS credentials, model access and region.', usage }
    }
    let reply: BedrockReply
    try {
      reply = parseBedrockReply(run.stdout)
    } catch (err) {
      return { text: text.trim(), error: err instanceof Error ? err.message : String(err), usage }
    }
    usage.inputTokens += reply.usage?.inputTokens ?? 0
    usage.outputTokens += reply.usage?.outputTokens ?? 0
    usage.cacheReadTokens += reply.usage?.cacheReadInputTokens ?? 0
    usage.cacheCreationTokens += reply.usage?.cacheWriteInputTokens ?? 0
    const blocks = reply.output?.message?.content ?? []
    const chunk = blocks.filter((b) => typeof b.text === 'string').map((b) => b.text).join('')
    if (chunk) {
      if (text) { text += '\n\n'; handlers.onDelta('\n\n') }
      text += chunk
      handlers.onDelta(chunk)
    }
    const calls = blocks.filter((b) => b.toolUse).map((b) => b.toolUse!)
    if (!calls.length) {
      usage.durationMs = Date.now() - started
      return { text: stripSkip(text), usage }
    }
    // Echo the entire assistant message before returning tool results.
    messages.push({ role: 'assistant', content: blocks as Record<string, unknown>[] })
    const results: Record<string, unknown>[] = []
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name)
      const args = call.input ?? {}
      const claudeName = tool?.claudeName ?? call.name
      handlers.onActivity(summarizeLocalTool(call.name, args))
      let output: string
      try {
        const needsAsk = !agent.autoApproveTools && needsApproval(agent, claudeName)
        if (!tool) output = 'Denied: unknown or unconfigured tool'
        else if (needsAsk && !(await handlers.onToolPermission?.(claudeName, args))) output = 'Denied by the owner'
        else output = await runLocalTool(call.name, args, cwd, allowOutside, signal)
      } catch (err) {
        output = 'Tool error: ' + (err instanceof Error ? err.message : String(err))
      }
      results.push({ toolResult: { toolUseId: call.toolUseId, content: [{ text: output.slice(0, 60_000) }], status: 'success' } })
    }
    messages.push({ role: 'user', content: results })
  }
  usage.durationMs = Date.now() - started
  return { text: stripSkip(text), usage, error: 'Reached the configured tool-turn limit.' }
}