import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTurnPrompt } from './agent.js'
import { findMentions } from './mentions.js'
import { initialQueue } from './orchestrator.js'
import type { Agent, Conversation, Team } from '../shared/types.js'

function agent(id: string, name: string): Agent {
  return { id, name, role: 'ROLE', color: '#fff', model: 'claude-opus-5', effort: 'low', personality: 'p', tools: [], permissionMode: 'dontAsk' }
}

const khaled = agent('khaled', 'KHALED')
const omar = agent('omar', 'OMAR')
const sara = agent('sara', 'SARA ALI')
const team: Team = { company: 'Co', owner: { id: 'user', name: 'Mahmoud Amr', title: 'CEO' }, workspace: '.', agents: [khaled, omar, sara] }

function group(memberIds = ['user', 'khaled', 'omar', 'sara']): Conversation {
  return { id: 'group', kind: 'group', name: 'Team', memberIds, messages: [], sessions: {} }
}

test('findMentions is case-insensitive, ordered by appearance, and respects word boundaries', () => {
  const found = findMentions('hey @omar and @Khaled, not @omarx or @sara', team.agents)
  assert.deepEqual(found.map((a) => a.id), ['omar', 'khaled'])
})

test('findMentions matches multi-word names and excludes self', () => {
  const found = findMentions('@SARA ALI can you check? @omar too', team.agents, 'omar')
  assert.deepEqual(found.map((a) => a.id), ['sara'])
})

test('initialQueue: no mentions means everyone in team order', () => {
  assert.deepEqual(initialQueue(team, group(), 'hello all').map((a) => a.id), ['khaled', 'omar', 'sara'])
})

test('initialQueue: mentions restrict to the mentioned members', () => {
  assert.deepEqual(initialQueue(team, group(), '@omar fix the bug').map((a) => a.id), ['omar'])
})

test('initialQueue: a DM always goes to the one member', () => {
  const dm: Conversation = { id: 'dm-omar', kind: 'dm', name: 'OMAR', memberIds: ['user', 'omar'], messages: [], sessions: {} }
  assert.deepEqual(initialQueue(team, dm, '@khaled?').map((a) => a.id), ['omar'])
})

test('buildTurnPrompt only includes messages since the agent last spoke when it has a session', () => {
  const c = group()
  c.messages = [
    { id: '1', conversationId: 'group', authorId: 'user', text: 'first', createdAt: 1, status: 'done' },
    { id: '2', conversationId: 'group', authorId: 'omar', text: 'my reply', createdAt: 2, status: 'done' },
    { id: '3', conversationId: 'group', authorId: 'khaled', text: 'later', createdAt: 3, status: 'done' },
  ]
  const withSession = buildTurnPrompt(team, c, omar, true)
  assert.ok(withSession.includes('[KHALED]: later'))
  assert.ok(!withSession.includes('first'))
  const fresh = buildTurnPrompt(team, c, omar, false)
  assert.ok(fresh.includes('[Mahmoud Amr]: first'))
  assert.ok(!fresh.includes('my reply'), 'own messages are never replayed as transcript')
})
