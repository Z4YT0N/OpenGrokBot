import { useEffect, useReducer, useRef, useState } from 'react'
import type { Conversation, ServerEvent } from '../../shared/types'
import { clearConversation, deleteConversation, duplicateAgent, exportUrl, fetchState, sendMessage, stopRound, updateAgent, updateConversation } from './api'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { Menu, type MenuItem } from './components/Menu'
import { NewChat } from './components/NewChat'
import { Profile } from './components/Profile'
import { Settings, type SettingsSection } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { personFor } from './people'
import { initialState, reducer } from './state'

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
    if (event.type !== 'message:done' || event.message.authorId === 'user' || event.message.status !== 'done') return
    const { state: s, activeId: current } = latest.current
    if (!s.team?.settings.notifications) return
    const away = document.hidden || !document.hasFocus() || event.message.conversationId !== current
    if (!away) return
    if (typeof Notification === 'undefined') return
    const show = () => {
      const person = s.team ? personFor(s.team, event.message.authorId) : null
      const n = new Notification(person?.label ?? 'Reply', { body: event.message.text.slice(0, 160), silent: true })
      n.onclick = () => {
        window.focus()
        setActiveId(event.message.conversationId)
      }
    }
    if (Notification.permission === 'granted') show()
    else if (Notification.permission === 'default') void Notification.requestPermission().then((p) => p === 'granted' && show())
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (chatEditor !== undefined) setChatEditor(undefined)
      else if (settings) setSettings(null)
      else if (profile !== undefined) setProfile(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, chatEditor, settings, profile])

  const conversation = state.conversations.find((c) => c.id === activeId) ?? state.conversations.find((c) => c.id === 'group') ?? state.conversations[0]

  if (!state.team || !conversation) {
    return (
      <div className="boot">
        {error ? <p className="boot-error">Could not reach the OpenGrok server: {error}</p> : <p>Opening the office…</p>}
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
    if (c.kind === 'group') items.push({ label: c.id === 'group' ? 'Rename' : 'Edit chat', onClick: () => setChatEditor(c) })
    if (agent) {
      items.push({ label: 'Edit profile', divider: true, onClick: () => setProfile(agent.id) })
      items.push({ label: agent.muted ? 'Unmute in groups' : 'Mute in groups', onClick: () => void updateAgent(agent.id, { muted: !agent.muted }).catch(fail) })
      items.push({
        label: 'Duplicate employee',
        onClick: () => void duplicateAgent(agent.id).then(({ agent: copy }) => setProfile(copy.id)).catch(fail),
      })
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
        onSelect={setActiveId}
        onMenu={(id, x, y) => setMenu({ conversationId: id, x, y })}
        onSettings={() => setSettings('general')}
        onNewChat={() => setChatEditor(null)}
      />
      <main className="main">
        <ChatView
          team={team}
          conversation={conversation}
          typing={state.typing.get(conversation.id) ?? new Set()}
          usage={state.usage}
          onEditAgent={(id) => setProfile(id)}
          profileOpen={profile !== undefined}
        />
        <Composer
          team={team}
          conversation={conversation}
          busy={busy}
          onSend={async (text) => {
            await sendMessage(conversation.id, text)
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
      {menu && <Menu x={menu.x} y={menu.y} items={menuItems(menu.conversationId)} onClose={() => setMenu(null)} />}
    </div>
  )
}
