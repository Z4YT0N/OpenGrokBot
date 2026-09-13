import { useState } from 'react'
import type { Conversation, Team } from '../../../shared/types'
import { createConversation, updateConversation } from '../api'
import { personFor } from '../people'
import { Avatar } from './Avatar'

interface NewChatProps {
  team: Team
  /** When set, edits this group's name and members instead of creating one. */
  conversation?: Conversation
  onDone: (id?: string) => void
}

export function NewChat({ team, conversation, onDone }: NewChatProps) {
  const [name, setName] = useState(conversation?.name ?? '')
  const [members, setMembers] = useState<string[]>(conversation ? conversation.memberIds.filter((m) => m !== 'user') : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const all = () => setMembers(team.agents.map((a) => a.id))
  const isMain = conversation?.id === 'group'

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (conversation) {
        await updateConversation(conversation.id, isMain ? { name: name.trim() } : { name: name.trim(), memberIds: members })
        onDone(conversation.id)
      } else {
        const { conversation: c } = await createConversation(name.trim() || members.map((id) => personFor(team, id).name).join(', '), members)
        onDone(c.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onDone()}>
      <div className="modal sheet" role="dialog">
        <h2>{conversation ? 'Edit chat' : 'New group chat'}</h2>
        {error && <div className="form-error">{error}</div>}
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product war room" autoFocus />
        </label>
        {!isMain && (
          <div className="field">
            <span>
              Members{' '}
              <button type="button" className="link" onClick={all}>
                select all
              </button>
            </span>
            <div className="member-picks">
              {team.agents.map((a) => {
                const p = personFor(team, a.id)
                const on = members.includes(a.id)
                return (
                  <button key={a.id} type="button" className={`member-pick${on ? ' is-active' : ''}`} onClick={() => toggle(a.id)}>
                    <Avatar person={p} size={26} />
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={() => onDone()}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || (!isMain && members.length === 0)} onClick={() => void save()}>
            {busy ? 'Saving…' : conversation ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
