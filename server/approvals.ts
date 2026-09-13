import { randomUUID } from 'node:crypto'
import { emit } from './events.js'
import type { Agent, ApprovalRequest, AutoReviewRule, Team } from '../shared/types.js'

const DANGEROUS = new Set(['Bash', 'Write', 'Edit', 'NotebookEdit'])
const TIMEOUT_MS = 10 * 60_000

interface Pending {
  request: ApprovalRequest
  resolve: (allowed: boolean) => void
  timer: NodeJS.Timeout
}

/** Which tools must stop for the owner, given the employee's policy. Others are auto-allowed. */
export function toolsNeedingApproval(agent: Agent): Set<string> | 'all' | 'none' {
  if (agent.approvals === 'ask-all') return 'all'
  if (agent.approvals === 'ask-dangerous') return DANGEROUS
  return 'none'
}

export function needsApproval(agent: Agent, tool: string): boolean {
  const set = toolsNeedingApproval(agent)
  if (set === 'none') return false
  if (set === 'all') return true
  return set.has(tool) || tool.startsWith('mcp__')
}

function ruleMatches(rule: AutoReviewRule, tool: string, inputText: string): boolean {
  if (rule.tool !== '*' && rule.tool.toLowerCase() !== tool.toLowerCase()) return false
  if (rule.match && !inputText.toLowerCase().includes(rule.match.toLowerCase())) return false
  return true
}

/** Personal auto-review: "require" beats "allow"; no rule → ask. */
export function reviewByRules(team: Team, tool: string, input: Record<string, unknown>): 'allow' | 'require' | 'ask' {
  const text = JSON.stringify(input)
  const hits = team.settings.autoReview.filter((r) => ruleMatches(r, tool, text))
  if (hits.some((r) => r.action === 'require')) return 'require'
  if (hits.some((r) => r.action === 'allow')) return 'allow'
  return 'ask'
}

export function summarizeInput(tool: string, input: Record<string, unknown>): string {
  const s = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Bash':
      return s('description') ? `${s('description')} — ${s('command')}` : s('command')
    case 'Write':
    case 'Edit':
    case 'Read':
    case 'NotebookEdit':
      return s('file_path')
    case 'run_command':
      return s('command')
    case 'write_file':
    case 'edit_file':
      return s('path')
    default:
      return JSON.stringify(input).slice(0, 300)
  }
}

/** Holds tool calls that wait for the owner's Allow / Deny in the chat. */
export class Approvals {
  private readonly pending = new Map<string, Pending>()

  list(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.request)
  }

  /** Resolves true (allowed) or false (denied or timed out). */
  ask(conversationId: string, agentId: string, tool: string, input: Record<string, unknown>, signal: AbortSignal): Promise<boolean> {
    const request: ApprovalRequest = { id: randomUUID(), conversationId, agentId, tool, summary: summarizeInput(tool, input), input, createdAt: Date.now() }
    return new Promise<boolean>((resolve) => {
      const finish = (allowed: boolean): void => {
        const p = this.pending.get(request.id)
        if (!p) return
        clearTimeout(p.timer)
        this.pending.delete(request.id)
        signal.removeEventListener('abort', onAbort)
        emit({ type: 'approval:resolved', id: request.id, allowed })
        resolve(allowed)
      }
      const onAbort = (): void => finish(false)
      const timer = setTimeout(() => finish(false), TIMEOUT_MS)
      this.pending.set(request.id, { request, resolve: finish, timer })
      signal.addEventListener('abort', onAbort, { once: true })
      emit({ type: 'approval:request', request })
    })
  }

  resolve(id: string, allowed: boolean): ApprovalRequest | undefined {
    const p = this.pending.get(id)
    if (!p) return undefined
    p.resolve(allowed)
    return p.request
  }
}
