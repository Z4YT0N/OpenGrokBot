import { useEffect, useReducer, useRef, useState } from 'react'
import type { Conversation, ServerEvent } from '../../shared/types'
import { clearConversation, deleteConversation, duplicateAgent, exportUrl, fetchState, sendMessageFull, stopRound, updateAgent, updateConversation } from './api'
import { ChatView } from './components/ChatView'
import { Composer, type ReplyTarget } from './components/Composer'
import { Menu, type MenuItem } from './components/Menu'
import { NewChat } from './components/NewChat'
import { Profile } from './components/Profile'
import { Search } from './components/Search'
import { Settings, type SettingsSection } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { personFor } from './people'
import { initialState, reducer } from './state'
import { markRead, markUnread } from './unread'

interface MenuState {
  x: number
  y: number
  conversationId: string
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [activeId, setActiveId] = useState('group')
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<SettingsSection | null>(null)
  /** undefined = closed, null = new employee, string = editing that employee */
  const [profile, setProfile] = useState<string | null | undefined>(undefined)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** undefined = closed, null = new chat, Conversation = editing */
  const [chatEditor, setChatEditor] = useState<Conversation | null | undefined>(undefined)
  const [search, setSearch] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const [jumpTo, setJumpTo] = useState<string | null>(null)
  const [readTick, setReadTick] = useState(0)
  const latest = useRef({ activeId, state })
  latest.current = { activeId, state }

  useEffect(() => {
    let alive = true
    const load = () =>
      fetchState()
        .then((s) => {
          if (alive) dispatch({ type: 'state', state: s })
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    void load()
    const es = new EventSource('/api/events')
    es.onopen = () => {
      dispatch({ type: 'connected', connected: true })
      // Anything that happened while we were disconnected is on the server; resync.
      void load()
    }
    es.onerror = () => dispatch({ type: 'connected', connected: false })
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent
        dispatch({ type: 'event', event })
        maybeNotify(event)
      } catch {
        // ignore malformed frames
      }
    }
    return () => {
      alive = false
      es.close()
    }
  }, [])

  const maybeNotify = (event: ServerEvent) => {
    const { state: s, activeId: current } = latest.current
    if (!s.team?.settings.notifications || typeof Notification === 'undefined') return
    let title = ''
    let body = ''
    let conversationId = ''
    if (event.type === 'message:done' && event.message.authorId !== 'user' && event.message.status === 'done') {
      const away = document.hidden || !document.hasFocus() || event.message.conversationId !== current
      if (!away) return
      title = s.team ? personFor(s.team, event.message.authorId).label : 'Reply'
      body = event.message.text.slice(0, 160)
      conversationId = event.message.conversationId
    } else if (event.type === 'approval:request') {
      title = `${s.team ? personFor(s.team, event.request.agentId).name : 'An employee'} needs your approval`
      body = `${event.request.tool}: ${event.request.summary}`.slice(0, 160)
      conversationId = event.request.conversationId
    } else return
    const show = () => {
      const n = new Notification(title, { body, silent: true })
      n.onclick = () => {
        window.focus()
        setActiveId(conversationId)
      }
    }
    if (Notification.permission === 'granted') show()
    else if (Notification.permission === 'default') void Notification.requestPermission().then((p) => p === 'granted' && show())
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch((v) => !v)
        return
      }
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (search) setSearch(false)
      else if (chatEditor !== undefined) setChatEditor(undefined)
      else if (settings) setSettings(null)
      else if (profile !== undefined) setProfile(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, search, chatEditor, settings, profile])

  const conversation = state.conversations.find((c) => c.id === activeId) ?? state.conversations.find((c) => c.id === 'group') ?? state.conversations[0]

  // Reading a conversation marks it read (also as new replies arrive while it is open).
  const lastAt = conversation?.messages[conversation.messages.length - 1]?.createdAt ?? 0
  useEffect(() => {
    if (!conversation) return
    markRead(conversation.id)
    setReadTick((t) => t + 1)
  }, [conversation?.id, lastAt])

  useEffect(() => setReplyTo(null), [activeId])

  if (!state.team || !conversation) {
    return (
      <div className="boot">
        {error ? <p className="boot-error">Could not reach the OpenGrokBot server: {error}</p> : <p>Opening the office…</p>}
      </div>
    )
  }

  const team = state.team
  const busy = state.busy.has(conversation.id)
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err))

  const menuItems = (conversationId: string): MenuItem[] => {
    const c = state.conversations.find((x) => x.id === conversationId)
    if (!c) return []
    const agentId = c.kind === 'dm' ? c.memberIds.find((id) => id !== 'user') : undefined
    const agent = agentId ? team.agents.find((a) => a.id === agentId) : undefined
    const items: MenuItem[] = []
    items.push({ label: c.pinned ? 'Unpin' : 'Pin', onClick: () => void updateConversation(c.id, { pinned: !c.pinned }).catch(fail) })
    items.push({
      label: 'Mark as unread',
      onClick: () => {
        markUnread(c.id)
        if (latest.current.activeId === c.id) setActiveId('group')
        setReadTick((t) => t + 1)
      },
    })
    if (c.id !== 'group') items.push({ label: c.hidden ? 'Unhide' : 'Hide from sidebar', onClick: () => void updateConversation(c.id, { hidden: !c.hidden }).catch(fail) })
    if (c.kind === 'group') items.push({ label: c.id === 'group' ? 'Rename' : 'Edit chat', onClick: () => setChatEditor(c) })
    if (agent) {
      items.push({ label: 'Edit profile', divider: true, onClick: () => setProfile(agent.id) })
      items.push({ label: agent.muted ? 'Unmute in groups' : 'Mute in groups', onClick: () => void updateAgent(agent.id, { muted: !agent.muted }).catch(fail) })
      items.push({ label: 'Duplicate employee', onClick: () => void duplicateAgent(agent.id).then(({ agent: copy }) => setProfile(copy.id)).catch(fail) })
    }
    items.push({ label: 'Export as Markdown', divider: true, onClick: () => window.open(exportUrl(c.id), '_blank') })
    items.push({ label: 'Clear conversation', onClick: () => void clearConversation(c.id).catch(fail) })
    if (c.kind === 'group' && c.id !== 'group') {
      items.push({
        label: 'Delete chat',
        danger: true,
        divider: true,
        onClick: () => {
          void deleteConversation(c.id)
            .then(() => {
              if (latest.current.activeId === c.id) setActiveId('group')
            })
            .catch(fail)
        },
      })
    }
    if (agent) items.push({ label: 'Delete employee', danger: true, divider: true, onClick: () => setProfile(agent.id) })
    return items
  }

  return (
    <div className="app">
      <Sidebar
        team={team}
        conversations={state.conversations}
        activeId={conversation.id}
        busy={state.busy}
        approvals={state.approvals}
        readTick={readTick}
        onSelect={setActiveId}
        onMenu={(id, x, y) => setMenu({ conversationId: id, x, y })}
        onSettings={() => setSettings('general')}
        onNewChat={() => setChatEditor(null)}
        onSearch={() => setSearch(true)}
      />
      <main className="main">
        <ChatView
          team={team}
          conversation={conversation}
          typing={state.typing.get(conversation.id) ?? new Set()}
          usage={state.usage}
          approvals={state.approvals}
          jumpTo={jumpTo}
          onEditAgent={(id) => setProfile(id)}
          onReply={setReplyTo}
          profileOpen={profile !== undefined}
        />
        <Composer
          team={team}
          conversation={conversation}
          busy={busy}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onSend={async (body) => {
            await sendMessageFull(conversation.id, body)
          }}
          onStop={() => void stopRound(conversation.id)}
        />
        {!state.connected && <div className="offline">Reconnecting to the office…</div>}
        {error && (
          <div className="toast" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </main>
      {profile !== undefined && (
        <Profile
          team={team}
          agentId={profile}
          usage={profile ? state.usage.byAgent[profile] : undefined}
          onClose={() => setProfile(undefined)}
          onSaved={(id) => {
            setProfile(id)
            if (profile === null) setActiveId(`dm-${id}`)
          }}
        />
      )}
      {settings && (
        <Settings
          team={team}
          routines={state.routines}
          conversations={state.conversations}
          usage={state.usage}
          account={state.account}
          section={settings}
          onSection={setSettings}
          onClose={() => setSettings(null)}
          onEditAgent={(id) => {
            setSettings(null)
            setProfile(id)
          }}
        />
      )}
      {chatEditor !== undefined && (
        <NewChat
          team={team}
          {...(chatEditor ? { conversation: chatEditor } : {})}
          onDone={(id) => {
            setChatEditor(undefined)
            if (id) setActiveId(id)
          }}
        />
      )}
      {search && (
        <Search
          team={team}
          conversations={state.conversations}
          onClose={() => setSearch(false)}
          onPick={(conversationId, messageId) => {
            setSearch(false)
            setActiveId(conversationId)
            setJumpTo(messageId ? `${messageId}` : null)
            if (messageId) setTimeout(() => setJumpTo(messageId), 50)
          }}
        />
      )}
      {menu && <Menu x={menu.x} y={menu.y} items={menuItems(menu.conversationId)} onClose={() => setMenu(null)} />}
    </div>
  )
}
