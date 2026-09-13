import type { AppState, Message } from '../../shared/types'

export async function fetchState(): Promise<AppState> {
  const res = await fetch('/api/state')
  if (!res.ok) throw new Error(`state ${res.status}`)
  return (await res.json()) as AppState
}

export async function sendMessage(conversationId: string, text: string): Promise<Message> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`send ${res.status}`)
  const data = (await res.json()) as { message: Message }
  return data.message
}

export async function stopRound(conversationId: string): Promise<void> {
  await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/stop`, { method: 'POST' })
}
