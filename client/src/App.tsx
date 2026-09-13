import { useEffect, useReducer, useState } from 'react'
import type { ServerEvent } from '../../shared/types'
import { clearConversation, fetchState, sendMessage, stopRound } from './api'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { Menu, type MenuItem } from './components/Menu'
import { Profile } from './components/Profile'
import { Settings, type SettingsSection } from './components/Settings'
import { Sidebar } from './components/Sidebar'
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
        dispatch({ type: 'event', event: JSON.parse(e.data) as ServerEvent })
      } catch {
        // ignore malformed frames
      }
    }
    return () => {
      alive = false
      es.close()
    }
  }, [])

  const conversation = state.conversations.find((c) => c.id === activeId) ?? state.conversations[0]

  if (!state.team || !conversation) {
    return (
      <div className="boot">
        {error ? <p className="boot-error">Could not reach the office server: {error}</p> : <p>Opening the office…</p>}
      </div>
    )
  }

  const team = state.team
  const busy = state.busy.has(conversation.id)

  const menuItems = (conversationId: string): MenuItem[] => {
    const c = state.conversations.find((x) => x.id === conversationId)
    const agentId = c?.kind === 'dm' ? c.memberIds.find((id) => id !== 'user') : undefined
    const items: MenuItem[] = []
    if (agentId) items.push({ label: 'Edit profile', onClick: () => setProfile(agentId) })
    items.push({
      label: 'Clear conversation',
      divider: items.length > 0,
      onClick: () => {
        void clearConversation(conversationId).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      },
    })
    if (agentId) {
      items.push({
        label: 'Delete employee',
        danger: true,
        divider: true,
        onClick: () => setProfile(agentId),
      })
    }
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
        onNewEmployee={() => setProfile(null)}
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
      {menu && <Menu x={menu.x} y={menu.y} items={menuItems(menu.conversationId)} onClose={() => setMenu(null)} />}
    </div>
  )
}
