export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type AvatarShape = 'blob' | 'round' | 'triangle' | 'hex' | 'drop'

export interface Agent {
  id: string
  name: string
  role: string
  /** Short badge shown next to the name in the sidebar (e.g. "Backend"). */
  department?: string
  color: string
  shape: AvatarShape
  model: string
  effort: Effort
  personality: string
  tools: string[]
  permissionMode: PermissionMode
  /** Working directory for tools. Defaults to the team workspace. */
  cwd?: string
}

export interface Owner {
  id: 'user'
  name: string
  title: string
}

export interface Team {
  company: string
  owner: Owner
  workspace: string
  agents: Agent[]
}

export type MessageStatus = 'streaming' | 'done' | 'error'

export interface Message {
  id: string
  conversationId: string
  authorId: string
  text: string
  createdAt: number
  status: MessageStatus
  /** Short tool-activity lines shown under a streaming bubble (e.g. "Read server/index.ts"). */
  activity?: string[]
}

export type ConversationKind = 'group' | 'dm'

export interface Conversation {
  id: string
  kind: ConversationKind
  name: string
  memberIds: string[]
  messages: Message[]
  /** Agent SDK session id per agent, so each employee keeps memory of this conversation. */
  sessions: Record<string, string>
}

export interface AppState {
  team: Team
  conversations: Conversation[]
  /** Conversation ids that currently have a round running. */
  busy: string[]
}

export type ServerEvent =
  | { type: 'message:start'; message: Message }
  | { type: 'message:delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message:activity'; conversationId: string; messageId: string; line: string }
  | { type: 'message:done'; message: Message }
  | { type: 'message:remove'; conversationId: string; messageId: string }
  | { type: 'typing'; conversationId: string; agentId: string; on: boolean }
  | { type: 'round'; conversationId: string; running: boolean }
