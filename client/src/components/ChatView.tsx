import { useEffect, useRef, useState } from 'react'
import type { Conversation, Message, Team } from '../../../shared/types'
import { conversationAvatars, conversationTitle, personFor } from '../people'
import { Avatar, AvatarCluster } from './Avatar'
import { RichText } from './RichText'

interface ChatViewProps {
  team: Team
  conversation: Conversation
  typing: Set<string>
}

interface Group {
  authorId: string
  messages: Message[]
}

function groupMessages(messages: Message[]): Group[] {
  const groups: Group[] = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (last && last.authorId === m.authorId && m.createdAt - (last.messages[last.messages.length - 1]?.createdAt ?? 0) < 5 * 60_000) {
      last.messages.push(m)
    } else {
      groups.push({ authorId: m.authorId, messages: [m] })
    }
  }
  return groups
}

export function ChatView({ team, conversation, typing }: ChatViewProps) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)
  const [showInfo, setShowInfo] = useState(conversation.kind === 'group')
  const groups = groupMessages(conversation.messages)
  const typingPeople = [...typing].filter((id) => !conversation.messages.some((m) => m.authorId === id && m.status === 'streaming')).map((id) => personFor(team, id))

  const lastMessage = conversation.messages[conversation.messages.length - 1]
  const lastKey = `${conversation.id}:${conversation.messages.length}:${lastMessage?.text.length ?? 0}:${typingPeople.length}`
  // Keep the view pinned to the bottom while streaming, unless the user scrolled up.
  useEffect(() => {
    const el = scroller.current
    if (!el || !pinned.current) return
    el.scrollTop = el.scrollHeight
  }, [lastKey])

  useEffect(() => {
    pinned.current = true
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversation.id])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const people = conversationAvatars(conversation).map((id) => personFor(team, id))

  return (
    <section className="chat">
      <header className="chat-header">
        <AvatarCluster people={people} size={30} />
        <h1 className="chat-title">{conversationTitle(team, conversation)}</h1>
        <button type="button" className={`icon-button${showInfo ? ' is-active' : ''}`} onClick={() => setShowInfo((v) => !v)} aria-label={showInfo ? 'Hide members' : 'Show members'}>
          {showInfo ? <ChevronsIcon /> : <InfoIcon />}
        </button>
      </header>
      <div className="chat-body">
        <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
          <div className="chat-messages">
            {groups.length === 0 && (
              <div className="chat-empty">
                <AvatarCluster people={people} size={56} />
                <p>{conversation.kind === 'group' ? 'Say something and the team will jump in.' : `Talk to ${people[0]?.label ?? 'your colleague'} privately.`}</p>
              </div>
            )}
            {groups.map((g) => (
              <MessageGroup key={g.messages[0]?.id ?? g.authorId} team={team} group={g} />
            ))}
            {typingPeople.map((p) => (
              <div key={p.id} className="message-group is-agent">
                <span className="message-label" style={{ color: p.color }}>
                  {p.label}
                </span>
                <div className="message-row">
                  <span className="message-avatar">
                    <Avatar person={p} size={28} />
                  </span>
                  <div className="bubble bubble-typing" aria-label={`${p.name} is typing`}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {showInfo && (
          <aside className="info-panel">
            <h2>Members</h2>
            {conversation.memberIds
              .filter((id) => id !== 'user')
              .map((id) => {
                const p = personFor(team, id)
                const busy = typing.has(id)
                return (
                  <div key={id} className="info-member" title={p.agent ? `${p.agent.model} · ${p.agent.tools.length ? p.agent.tools.join(', ') : 'chat only'}` : ''}>
                    <Avatar person={p} size={30} />
                    <div className="info-name">{p.label}</div>
                    {busy && <span className="dot" aria-label="typing" />}
                  </div>
                )
              })}
          </aside>
        )}
      </div>
    </section>
  )
}

function MessageGroup({ team, group }: { team: Team; group: Group }) {
  const person = personFor(team, group.authorId)
  const mine = person.kind === 'owner'
  return (
    <div className={`message-group ${mine ? 'is-mine' : 'is-agent'}`}>
      {!mine && (
        <span className="message-label" style={{ color: person.color }}>
          {person.label}
        </span>
      )}
      {group.messages.map((m, i) => {
        const last = i === group.messages.length - 1
        return (
          <div key={m.id} className="message-row">
            {!mine && <span className="message-avatar">{last && <Avatar person={person} size={28} />}</span>}
            <div dir="auto" className={`bubble${m.status === 'streaming' ? ' is-streaming' : ''}${m.status === 'error' ? ' is-error' : ''}`}>
              {m.activity && m.activity.length > 0 && (
                <div className="activity">
                  {m.activity.slice(-4).map((line, j) => (
                    <div key={j} className="activity-line">
                      <ToolIcon />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.text.length > 0 ? <RichText text={m.text} team={team} /> : m.status === 'streaming' ? <span className="working">working…</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChevronsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 5l5 5-5 5M11 5l5 5-5 5" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.5v.5" />
    </svg>
  )
}

function ToolIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6l6 4-6 4M11 15h5" />
    </svg>
  )
}
