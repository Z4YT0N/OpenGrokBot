import type { AccountStatus, Agent, AppState, McpServerDef, Message, TeamSettings } from '../../shared/types'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export function fetchState(): Promise<AppState> {
  return call<AppState>('/api/state')
}

export async function sendMessage(conversationId: string, text: string): Promise<Message> {
  const data = await call<{ message: Message }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, json('POST', { text }))
  return data.message
}

export function stopRound(conversationId: string): Promise<unknown> {
  return call(`/api/conversations/${encodeURIComponent(conversationId)}/stop`, { method: 'POST' })
}

export function clearConversation(conversationId: string): Promise<unknown> {
  return call(`/api/conversations/${encodeURIComponent(conversationId)}/clear`, { method: 'POST' })
}

export type AgentPatch = Partial<Omit<Agent, 'id'>>

export function updateAgent(id: string, patch: AgentPatch): Promise<{ agent: Agent }> {
  return call(`/api/team/agents/${encodeURIComponent(id)}`, json('PUT', patch))
}

export function createAgent(agent: Agent): Promise<{ agent: Agent }> {
  return call('/api/team/agents', json('POST', agent))
}

export function deleteAgent(id: string): Promise<unknown> {
  return call(`/api/team/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function putMcpServer(name: string, def: McpServerDef): Promise<unknown> {
  return call(`/api/team/mcp/${encodeURIComponent(name)}`, json('PUT', def))
}

export function deleteMcpServer(name: string): Promise<unknown> {
  return call(`/api/team/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export interface SettingsPatch {
  company?: string
  workspace?: string
  ownerName?: string
  ownerTitle?: string
  settings?: Partial<TeamSettings>
}

export function putSettings(patch: SettingsPatch): Promise<unknown> {
  return call('/api/team/settings', json('PUT', patch))
}

export function refreshAccount(): Promise<{ account: AccountStatus }> {
  return call('/api/account/refresh', { method: 'POST' })
}
