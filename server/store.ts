import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Conversation, Message, MessageUsage, Team } from '../shared/types.js'

export class Store {
  private readonly dir: string
  private readonly conversations = new Map<string, Conversation>()

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'conversations')
    mkdirSync(this.dir, { recursive: true })
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const c = JSON.parse(readFileSync(path.join(this.dir, f), 'utf8')) as Conversation
        // A message that was streaming when the server died can never finish.
        for (const m of c.messages) if (m.status === 'streaming') m.status = 'error'
        this.conversations.set(c.id, c)
      } catch (err) {
        console.warn(`[store] skipping unreadable ${f}:`, err)
      }
    }
  }

  /** Make sure the main group and one DM per agent exist and reflect the current team. */
  seed(team: Team): void {
    const agentIds = team.agents.map((a) => a.id)
    const group = this.conversations.get('group')
    if (group) {
      group.memberIds = ['user', ...agentIds]
    } else {
      this.conversations.set('group', {
        id: 'group',
        kind: 'group',
        name: 'Team',
        memberIds: ['user', ...agentIds],
        messages: [],
        sessions: {},
        createdAt: Date.now(),
      })
    }
    for (const c of [...this.conversations.values()]) {
      if (c.kind === 'dm' && !c.memberIds.some((id) => agentIds.includes(id))) {
        // The employee is gone: drop the DM from the sidebar, keep the file as a backup.
        this.conversations.delete(c.id)
      } else if (c.kind === 'group' && c.id !== 'group') {
        c.memberIds = c.memberIds.filter((id) => id === 'user' || agentIds.includes(id))
      }
    }
    for (const a of team.agents) {
      const id = `dm-${a.id}`
      if (!this.conversations.has(id)) {
        this.conversations.set(id, {
          id,
          kind: 'dm',
          name: a.name,
          memberIds: ['user', a.id],
          messages: [],
          sessions: {},
          createdAt: Date.now(),
        })
      }
    }
    for (const c of this.conversations.values()) this.flush(c)
  }

  createGroup(name: string, memberIds: string[]): Conversation {
    const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const c: Conversation = { id, kind: 'group', name, memberIds: ['user', ...memberIds.filter((m) => m !== 'user')], messages: [], sessions: {}, createdAt: Date.now() }
    this.conversations.set(id, c)
    this.flush(c)
    return c
  }

  update(id: string, patch: { name?: string; memberIds?: string[]; pinned?: boolean }): Conversation | undefined {
    const c = this.conversations.get(id)
    if (!c) return undefined
    if (patch.name !== undefined && c.kind === 'group') c.name = patch.name
    if (patch.memberIds !== undefined && c.kind === 'group' && c.id !== 'group') c.memberIds = ['user', ...patch.memberIds.filter((m) => m !== 'user')]
    if (patch.pinned !== undefined) c.pinned = patch.pinned
    this.flush(c)
    return c
  }

  delete(id: string): boolean {
    const c = this.conversations.get(id)
    if (!c || id === 'group' || c.kind === 'dm') return false
    this.conversations.delete(id)
    const file = path.join(this.dir, `${id}.json`)
    if (existsSync(file)) unlinkSync(file)
    return true
  }

  /** Wipe a conversation's messages, usage and sessions. */
  clear(id: string): boolean {
    const c = this.conversations.get(id)
    if (!c) return false
    c.messages = []
    c.sessions = {}
    delete c.silent
    this.flush(c)
    return true
  }

  list(): Conversation[] {
    return [...this.conversations.values()]
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id)
  }

  addMessage(conversationId: string, message: Message): void {
    const c = this.must(conversationId)
    c.messages.push(message)
    this.flush(c)
  }

  updateMessage(conversationId: string, messageId: string, patch: Partial<Message>): Message | undefined {
    const c = this.must(conversationId)
    const m = c.messages.find((x) => x.id === messageId)
    if (!m) return undefined
    Object.assign(m, patch)
    this.flush(c)
    return m
  }

  /** A skipped turn still costs tokens: keep them as a hidden zero-text message so totals stay honest. */
  recordSilentUsage(conversationId: string, agentId: string, usage: MessageUsage): void {
    const c = this.must(conversationId)
    c.silent ??= []
    c.silent.push({ agentId, usage, at: Date.now() })
    this.flush(c)
  }

  removeMessage(conversationId: string, messageId: string): void {
    const c = this.must(conversationId)
    const i = c.messages.findIndex((x) => x.id === messageId)
    if (i === -1) return
    c.messages.splice(i, 1)
    this.flush(c)
  }

  setSession(conversationId: string, key: string, sessionId: string): void {
    const c = this.must(conversationId)
    c.sessions[key] = sessionId
    this.flush(c)
  }

  clearSession(conversationId: string, key: string): void {
    const c = this.must(conversationId)
    delete c.sessions[key]
    this.flush(c)
  }

  private must(id: string): Conversation {
    const c = this.conversations.get(id)
    if (!c) throw new Error(`unknown conversation ${id}`)
    return c
  }

  private flush(c: Conversation): void {
    const file = path.join(this.dir, `${c.id}.json`)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(c, null, 2))
    renameSync(tmp, file)
  }
}
