import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTurnPrompt } from './agent.js'
import { findMentions } from './mentions.js'
import { expandSkills, initialQueue } from './orchestrator.js'
import { nextRun, parseCron } from './cron.js'
import { reviewByRules } from './approvals.js'
import { __test as routerTest } from './router.js'
import type { Agent, Conversation, Team } from '../shared/types.js'

function agent(id: string, name: string): Agent {
  return { id, name, role: 'ROLE', color: '#fff', model: 'claude-opus-5', effort: 'low', personality: 'p', tools: [], permissionMode: 'dontAsk', shape: 'blob', mcpServers: [], inheritClaudeSettings: false, autoApproveTools: false, provider: 'claude', muted: false, approvals: 'auto' }
}

const khaled = agent('khaled', 'KHALED')
const omar = agent('omar', 'OMAR')
const sara = agent('sara', 'SARA ALI')
const team: Team = { company: 'Co', owner: { id: 'user', name: 'Mahmoud Amr', title: 'CEO' }, workspace: '.', agents: [khaled, omar, sara], mcpServers: {}, providers: { claude: { kind: 'claude', label: 'Claude' } }, settings: { maxMessagesPerRound: 8, maxTurnsPerAgentPerRound: 2, maxTurnsPerReply: 40, groupMode: 'everyone', language: 'auto', notifications: true, autoReview: [] }, skills: { standup: { name: 'Standup', description: '', body: 'List what shipped, what is blocked, what is next.' } } }
const smartTeam: Team = { ...team, settings: { ...team.settings, groupMode: 'smart' } }

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

test('initialQueue: no mentions means everyone in team order (everyone mode)', () => {
  assert.deepEqual(initialQueue(team, group(), 'hello all')?.map((a) => a.id), ['khaled', 'omar', 'sara'])
})

test('initialQueue: smart mode defers to the router unless someone is mentioned', () => {
  assert.equal(initialQueue(smartTeam, group(), 'hello all'), null)
  assert.deepEqual(initialQueue(smartTeam, group(), '@omar go')?.map((a) => a.id), ['omar'])
})

test('router.parse accepts ids or names, caps at three, defaults mode to discuss', () => {
  const r = routerTest.parse('Sure: {"speakers":["OMAR","khaled","sara","nobody","omar"],"mode":"weird"}', team.agents)
  assert.deepEqual(r?.ids, ['omar', 'khaled', 'sara'])
  assert.equal(r?.mode, 'discuss')
  assert.equal(routerTest.parse('no json here', team.agents), null)
})

test('initialQueue: mentions restrict to the mentioned members', () => {
  assert.deepEqual(initialQueue(team, group(), '@omar fix the bug')?.map((a) => a.id), ['omar'])
})

test('initialQueue: a DM always goes to the one member', () => {
  const dm: Conversation = { id: 'dm-omar', kind: 'dm', name: 'OMAR', memberIds: ['user', 'omar'], messages: [], sessions: {} }
  assert.deepEqual(initialQueue(team, dm, '@khaled?')?.map((a) => a.id), ['omar'])
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
  assert.ok(fresh.includes('[OMAR (you)]: my reply'), 'stateless providers see their own earlier lines marked (you)')
})

test('@everyone mentions every member except the speaker', () => {
  assert.deepEqual(findMentions('@everyone status?', team.agents, 'omar').map((a) => a.id), ['khaled', 'sara'])
})

test('expandSkills replaces /skill tokens and leaves unknown ones', () => {
  assert.equal(expandSkills(team, '/standup please'), '[Skill "Standup": List what shipped, what is blocked, what is next.] please')
  assert.equal(expandSkills(team, 'see /unknown and a/b'), 'see /unknown and a/b')
})

test('cron: parse, next run, and bad input', () => {
  const n = nextRun('0 8 * * *', new Date(2026, 8, 13, 9, 0))
  assert.ok(n && n.getHours() === 8 && n.getDate() === 14)
  const w = nextRun('0 9 * * 0-4', new Date(2026, 8, 11, 12, 0)) // Friday → Sunday 09:00
  assert.ok(w && w.getDay() === 0 && w.getHours() === 9)
  assert.throws(() => parseCron('99 * * * *'))
  assert.throws(() => parseCron('* * *'))
})

test('auto-review: require beats allow, no rule asks', () => {
  const t2: Team = { ...team, settings: { ...team.settings, autoReview: [{ id: '1', action: 'allow', tool: 'Bash' }, { id: '2', action: 'require', tool: 'Bash', match: 'rm -rf' }] } }
  assert.equal(reviewByRules(t2, 'Bash', { command: 'git status' }), 'allow')
  assert.equal(reviewByRules(t2, 'Bash', { command: 'rm -rf dist' }), 'require')
  assert.equal(reviewByRules(t2, 'Write', { file_path: 'x' }), 'ask')
})
