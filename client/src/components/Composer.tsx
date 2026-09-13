import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Conversation, Team } from '../../../shared/types'
import { conversationTitle, personFor } from '../people'
import { Avatar } from './Avatar'

interface ComposerProps {
  team: Team
  conversation: Conversation
  busy: boolean
  onSend: (text: string) => Promise<void>
  onStop: () => void
}

interface MentionQuery {
  start: number
  query: string
}

function mentionAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && /[A-Za-z0-9_]/.test(before[at - 1] ?? '')) return null
  const query = before.slice(at + 1)
  if (/\s/.test(query)) return null
  return { start: at, query }
}

export function Composer({ team, conversation, busy, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [sending, setSending] = useState(false)
  const area = useRef<HTMLTextAreaElement | null>(null)

  const members = conversation.kind === 'group' ? team.agents.filter((a) => conversation.memberIds.includes(a.id)) : []
  const mention = members.length > 0 ? mentionAt(text, caret) : null
  const suggestions = mention ? members.filter((a) => a.name.toLowerCase().startsWith(mention.query.toLowerCase())) : []

  useEffect(() => {
    setHighlight(0)
  }, [mention?.query])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  useEffect(() => {
    setText('')
    area.current?.focus()
  }, [conversation.id])

  const insertMention = (name: string) => {
    if (!mention) return
    const next = `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`
    setText(next)
    const pos = mention.start + name.length + 2
    requestAnimationFrame(() => {
      area.current?.setSelectionRange(pos, pos)
      setCaret(pos)
      area.current?.focus()
    })
  }

  const submit = async () => {
    const value = text.trim()
    if (value.length === 0 || sending) return
    setSending(true)
    try {
      await onSend(value)
      setText('')
    } finally {
      setSending(false)
      area.current?.focus()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const pick = suggestions[highlight] ?? suggestions[0]
        if (pick) insertMention(pick.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setText((t) => t)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && (
        <div className="mention-menu" role="listbox">
          {suggestions.map((a, i) => {
            const p = personFor(team, a.id)
            return (
              <button
                type="button"
                key={a.id}
                role="option"
                aria-selected={i === highlight}
                className={`mention-option${i === highlight ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(a.name)
                }}
              >
                <Avatar person={p} size={22} />
                <span className="mention-option-name">{a.name}</span>
                <span className="mention-option-role">{a.role}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="composer">
        <span className="composer-plus" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </span>
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={`Message ${conversationTitle(team, conversation)}`}
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
          }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button type="button" className="composer-action is-stop" onClick={onStop} aria-label="Stop the team">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="button" className="composer-action" onClick={() => void submit()} disabled={text.trim().length === 0 || sending} aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 16V4M4.5 9.5L10 4l5.5 5.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
