import { useEffect, useReducer, useState } from 'react'
import type { ServerEvent } from '../../shared/types'
import { fetchState, sendMessage, stopRound } from './api'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { Sidebar } from './components/Sidebar'
import { initialState, reducer } from './state'

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [activeId, setActiveId] = useState('group')
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="app">
      <Sidebar team={team} conversations={state.conversations} activeId={conversation.id} busy={state.busy} onSelect={setActiveId} />
      <main className="main">
        <ChatView team={team} conversation={conversation} typing={state.typing.get(conversation.id) ?? new Set()} />
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
    </div>
  )
}
