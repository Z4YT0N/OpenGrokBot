import { useState } from 'react'
import type { Conversation, Team } from '../../../shared/types'
import { conversationAvatars, conversationTitle, formatTime, personFor } from '../people'
import { Avatar, AvatarCluster } from './Avatar'

interface SidebarProps {
  team: Team
  conversations: Conversation[]
  activeId: string
  busy: Set<string>
  onSelect: (id: string) => void
  onMenu: (conversationId: string, x: number, y: number) => void
  onSettings: () => void
  onNewEmployee: () => void
}

export function Sidebar({ team, conversations, activeId, busy, onSelect, onMenu, onSettings, onNewEmployee }: SidebarProps) {
  const [q, setQ] = useState('')
  const owner = personFor(team, 'user')
  const rank = (c: Conversation): number => {
    if (c.kind === 'group') return -1
    const agentId = c.memberIds.find((id) => id !== 'user')
    const i = team.agents.findIndex((a) => a.id === agentId)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const ordered = [...conversations].sort((a, b) => rank(a) - rank(b))
  const filtered = ordered.filter((c) => conversationTitle(team, c).toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button type="button" className="icon-button" title="New employee" aria-label="New employee" onClick={onNewEmployee}>
          <PlusIcon />
        </button>
      </div>
      <label className="search">
        <SearchIcon />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
      </label>
      <nav className="conversation-list">
        {filtered.map((c) => {
          const last = c.messages[c.messages.length - 1]
          const people = conversationAvatars(c).map((id) => personFor(team, id))
          const active = c.id === activeId
          const preview = last ? previewOf(team, c, last.authorId, last.text) : c.kind === 'group' ? 'Say hi to the team' : 'Start a conversation'
          return (
            <button
              key={c.id}
              type="button"
              className={`conversation${active ? ' is-active' : ''}`}
              onClick={() => onSelect(c.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onMenu(c.id, e.clientX, e.clientY)
              }}
            >
              <span className="conversation-avatar">
                <AvatarCluster people={people} size={c.kind === 'group' ? 40 : 44} />
              </span>
              <span className="conversation-body">
                <span className="conversation-row">
                  <span className="conversation-title">{conversationTitle(team, c)}</span>
                  {c.kind === 'dm' && people[0]?.agent?.department && <span className="badge">{people[0].agent.department}</span>}
                  {last && <span className="conversation-time">{formatTime(last.createdAt)}</span>}
                </span>
                <span className="conversation-row">
                  <span className="conversation-preview">{preview}</span>
                  {busy.has(c.id) && <span className="dot" aria-label="Replying" />}
                </span>
              </span>
              <span
                className="conversation-more"
                role="button"
                tabIndex={-1}
                aria-label="More"
                onClick={(e) => {
                  e.stopPropagation()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  onMenu(c.id, r.left, r.bottom + 4)
                }}
              >
                <MoreIcon />
              </span>
            </button>
          )
        })}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="sidebar-item" onClick={onSettings}>
          <span className="sidebar-item-icon">
            <GearIcon />
          </span>
          <span>Settings</span>
        </button>
        <button type="button" className="sidebar-item" onClick={onSettings}>
          <Avatar person={owner} size={30} />
          <span>{owner.name}</span>
          <span className="muted small">{team.company}</span>
        </button>
      </div>
    </aside>
  )
}

function previewOf(team: Team, c: Conversation, authorId: string, text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return `${personFor(team, authorId).name} is typing…`
  if (c.kind === 'dm' || authorId === 'user') return clean
  return `${personFor(team, authorId).name}: ${clean}`
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l3.5 3.5" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <circle cx="4" cy="10" r="1.8" />
      <circle cx="10" cy="10" r="1.8" />
      <circle cx="16" cy="10" r="1.8" />
    </svg>
  )
}
