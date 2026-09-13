export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type AvatarShape = 'blob' | 'round' | 'triangle' | 'hex' | 'drop'

export type McpServerDef =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> }

/**
 * Where an employee's brain runs.
 * - claude: Claude Code via the Agent SDK. Your Claude subscription login by default, or an API key.
 * - codex:  OpenAI Codex CLI (`codex exec`). Your ChatGPT/Codex subscription login.
 * - gemini: Google Gemini CLI. Your Google account (the same one Antigravity uses).
 * - openai: any OpenAI-compatible chat API: Kimi/Moonshot, OpenRouter, DeepSeek, Groq, xAI, Ollama…
 */
export type ProviderKind = 'claude' | 'codex' | 'gemini' | 'openai'

export interface ProviderDef {
  kind: ProviderKind
  label: string
  /** API key. For `claude` it switches from subscription login to API billing. */
  apiKey?: string
  /** Base URL for `openai` providers (e.g. https://api.moonshot.ai/v1). */
  baseUrl?: string
  /** Model ids offered in the picker. Free text is always allowed. */
  models?: string[]
}

export interface Agent {
  id: string
  name: string
  role: string
  /** Short badge shown next to the name in the sidebar (e.g. "Backend"). */
  department?: string
  /** One line: what this employee owns and answers for. Drives routing and stays-in-lane behavior. */
  scope?: string
  color: string
  shape: AvatarShape
  /** Key into team.providers. Defaults to "claude". */
  provider: string
  model: string
  effort: Effort
  personality: string
  tools: string[]
  permissionMode: PermissionMode
  /** Working directory for tools. Defaults to the team workspace. */
  cwd?: string
  /** Names of team-level MCP servers this employee can use (claude provider). */
  mcpServers: string[]
  /** Load the owner's own Claude Code user settings (MCP servers, plugins, skills, CLAUDE.md). */
  inheritClaudeSettings: boolean
  /** Approve every tool call (including MCP tools) without prompting. */
  autoApproveTools: boolean
  /** Muted employees only speak in a group when mentioned. */
  muted: boolean
  /**
   * auto: listed tools run without asking (default).
   * ask-dangerous: Bash, Write and Edit stop for your approval in the chat.
   * ask-all: every tool call stops for approval.
   */
  approvals: ApprovalPolicy
}

export type ApprovalPolicy = 'auto' | 'ask-dangerous' | 'ask-all'

/** A personal auto-review rule. "require" wins over "allow" when both match. */
export interface AutoReviewRule {
  id: string
  action: 'allow' | 'require'
  /** Tool name (Read, Bash, Write, mcp__github__create_issue…) or * for any. */
  tool: string
  /** Optional substring that must appear in the tool input (e.g. "rm -rf", "production"). */
  match?: string
}

export interface Skill {
  name: string
  description: string
  /** Instructions inserted into the message when the skill is invoked with /name. */
  body: string
}

export interface Attachment {
  name: string
  /** Absolute path on this machine (under data/uploads). */
  path: string
  mime: string
  size: number
}

export interface RoutineRun {
  at: number
  status: 'ok' | 'error' | 'skipped'
  durationMs: number
  messageId?: string
  error?: string
}

export interface Routine {
  id: string
  name: string
  agentId: string
  conversationId: string
  /** 5-field cron in the server's local time zone, or empty for trigger-only routines. */
  cron: string
  instruction: string
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  nextRunAt?: number
  runs: RoutineRun[]
}

export interface ApprovalRequest {
  id: string
  conversationId: string
  agentId: string
  tool: string
  summary: string
  input: Record<string, unknown>
  createdAt: number
}

export interface Owner {
  id: 'user'
  name: string
  title: string
}

export type GroupMode = 'smart' | 'everyone' | 'mentions-only'
export type ReplyLanguage = 'auto' | 'ar' | 'en'

export interface TeamSettings {
  /** Max employee messages per owner message in a group. */
  maxMessagesPerRound: number
  /** Max times one employee may speak per round. */
  maxTurnsPerAgentPerRound: number
  /** Max agentic tool-loop turns inside one employee reply. */
  maxTurnsPerReply: number
  /** smart: a fast router picks the 1-3 relevant employees. everyone: all unmuted members reply. mentions-only: only the first member replies unless someone is mentioned. */
  groupMode: GroupMode
  /** Language employees reply in. auto = mirror the owner. */
  language: ReplyLanguage
  /** Desktop notifications when an employee finishes a reply. */
  notifications: boolean
  autoReview: AutoReviewRule[]
}

export interface Team {
  company: string
  owner: Owner
  workspace: string
  agents: Agent[]
  providers: Record<string, ProviderDef>
  mcpServers: Record<string, McpServerDef>
  skills: Record<string, Skill>
  settings: TeamSettings
}

export type MessageStatus = 'streaming' | 'done' | 'error'

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
  durationMs: number
  numTurns: number
  model: string
}

export interface Message {
  id: string
  conversationId: string
  authorId: string
  text: string
  createdAt: number
  status: MessageStatus
  /** Short tool-activity lines shown under a streaming bubble (e.g. "Read server/index.ts"). */
  activity?: string[]
  usage?: MessageUsage
  attachments?: Attachment[]
  replyTo?: { messageId: string; authorId: string; excerpt: string }
}

export type ConversationKind = 'group' | 'dm'

export interface Conversation {
  id: string
  kind: ConversationKind
  name: string
  memberIds: string[]
  messages: Message[]
  /** Provider session id per agent, so each employee keeps memory of this conversation. */
  sessions: Record<string, string>
  /** Usage from turns that produced no visible message (the employee chose to stay silent). */
  silent?: { agentId: string; usage: MessageUsage; at: number }[]
  pinned?: boolean
  hidden?: boolean
  createdAt?: number
}

export interface UsageTotals {
  messages: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
}

export interface UsageSummary {
  byAgent: Record<string, UsageTotals>
  byConversation: Record<string, UsageTotals>
  byModel: Record<string, UsageTotals>
  total: UsageTotals
}

export type RateLimitType = 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'seven_day_overage_included' | 'overage'

export interface RateLimitWindow {
  type: RateLimitType
  status: 'allowed' | 'allowed_warning' | 'rejected'
  /** 0..1 fraction of the window already used, when reported. */
  utilization?: number
  resetsAt?: number
  updatedAt: number
}

export interface AccountStatus {
  /** How Claude Code authenticated the last time an employee spoke (e.g. "none" = subscription login). */
  authSource?: string
  claudeCodeVersion?: string
  windows: Partial<Record<RateLimitType, RateLimitWindow>>
  updatedAt?: number
}

export interface ProviderStatus {
  id: string
  kind: ProviderKind
  ok: boolean
  detail: string
  models?: string[]
}

export interface AppState {
  team: Team
  conversations: Conversation[]
  /** Conversation ids that currently have a round running. */
  busy: string[]
  usage: UsageSummary
  account: AccountStatus
  routines: Routine[]
  approvals: ApprovalRequest[]
}

export type ServerEvent =
  | { type: 'message:start'; message: Message }
  | { type: 'message:delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message:activity'; conversationId: string; messageId: string; line: string }
  | { type: 'message:done'; message: Message }
  | { type: 'message:remove'; conversationId: string; messageId: string }
  | { type: 'typing'; conversationId: string; agentId: string; on: boolean }
  | { type: 'round'; conversationId: string; running: boolean }
  | { type: 'usage'; usage: UsageSummary }
  | { type: 'account'; account: AccountStatus }
  | { type: 'team'; team: Team; conversations: Conversation[] }
  | { type: 'approval:request'; request: ApprovalRequest }
  | { type: 'approval:resolved'; id: string; allowed: boolean }
  | { type: 'routines'; routines: Routine[] }
