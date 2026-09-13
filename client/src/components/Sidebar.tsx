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
}

export function Sidebar({ team, conversations, activeId, busy, onSelect }: SidebarProps) {
  const [q, setQ] = useState('')
  const owner = personFor(team, 'user')
  const ordered = [...conversations].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1
    return 0
  })
  const filtered = ordered.filter((c) => conversationTitle(team, c).toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button type="button" className="icon-button" title="New chat (coming soon)" aria-label="New chat">
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
            </button>
          )
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-item">
          <span className="sidebar-item-icon">
            <GridIcon />
          </span>
          <span>{team.company}</span>
        </div>
        <div className="sidebar-item">
          <Avatar person={owner} size={30} />
          <span>{owner.name}</span>
        </div>
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

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.5" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.5" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.5" />
    </svg>
  )
}
