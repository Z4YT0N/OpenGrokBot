import { useEffect, useRef, useState } from 'react'
import type { Conversation, Team } from '../../../shared/types'
import { conversationTitle, personFor } from '../people'

interface SearchProps {
  team: Team
  conversations: Conversation[]
  onPick: (conversationId: string, messageId?: string) => void
  onClose: () => void
}

interface Hit {
  conversationId: string
  messageId?: string
  title: string
  snippet: string
  at: number
}

/** Ctrl+K palette: jump to a chat or a message anywhere. */
export function Search({ team, conversations, onPick, onClose }: SearchProps) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => input.current?.focus(), [])

  const needle = q.trim().toLowerCase()
  const hits: Hit[] = []
  for (const c of conversations) {
    const title = conversationTitle(team, c)
    if (!needle || title.toLowerCase().includes(needle)) hits.push({ conversationId: c.id, title, snippet: c.kind === 'group' ? 'Group chat' : 'Direct message', at: Number.MAX_SAFE_INTEGER })
  }
  if (needle.length >= 2) {
    for (const c of conversations) {
      const title = conversationTitle(team, c)
      for (const m of [...c.messages].reverse()) {
        const i = m.text.toLowerCase().indexOf(needle)
        if (i === -1) continue
        const who = m.authorId === 'user' ? team.owner.name : m.authorId === 'routine' ? 'Routine' : personFor(team, m.authorId).name
        hits.push({ conversationId: c.id, messageId: m.id, title: `${who} · ${title}`, snippet: m.text.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' '), at: m.createdAt })
        if (hits.length > 60) break
      }
    }
  }
  const shown = hits.slice(0, 40)
  const pick = (h: Hit) => onPick(h.conversationId, h.messageId)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-label="Search">
        <input
          ref={input}
          value={q}
          placeholder="Search chats and messages…"
          onChange={(e) => {
            setQ(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(shown.length - 1, c + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            } else if (e.key === 'Enter') {
              const h = shown[cursor]
              if (h) pick(h)
            }
          }}
        />
        <div className="palette-list">
          {shown.length === 0 && <div className="palette-empty">Nothing found.</div>}
          {shown.map((h, i) => (
            <button key={`${h.conversationId}:${h.messageId ?? ''}`} type="button" className={`palette-item${i === cursor ? ' is-active' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => pick(h)}>
              <span className="palette-title">{h.title}</span>
              <span className="palette-snippet" dir="auto">
                {h.snippet}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
