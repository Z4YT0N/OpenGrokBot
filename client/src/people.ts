import type { Agent, Conversation, Team } from '../../shared/types'

export interface Person {
  id: string
  label: string
  name: string
  color: string
  kind: 'owner' | 'agent'
  agent?: Agent
}

export function personFor(team: Team, id: string): Person {
  if (id === 'user') {
    return { id, label: team.owner.name, name: team.owner.name, color: '#8e8e93', kind: 'owner' }
  }
  const agent = team.agents.find((a) => a.id === id)
  if (!agent) return { id, label: id, name: id, color: '#666', kind: 'agent' }
  return { id, label: `${agent.name} | ${agent.role}`, name: agent.name, color: agent.color, kind: 'agent', agent }
}

export function conversationTitle(team: Team, c: Conversation): string {
  if (c.kind === 'dm') {
    const other = c.memberIds.find((id) => id !== 'user')
    return other ? personFor(team, other).label : c.name
  }
  if (c.id !== 'group' && c.name) return c.name
  return c.memberIds.map((id) => personFor(team, id).label).join(', ')
}

export function conversationAvatars(c: Conversation): string[] {
  if (c.kind === 'dm') return c.memberIds.filter((id) => id !== 'user')
  return c.memberIds
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
