# Fortune Office — design

A local, company-style chat where AI employees (personas) reply to the owner and to each other, running on the owner's Claude subscription through the Claude Agent SDK. Replacement for the part of Grok Bot the owner liked: the "colleagues debating in a group" feel, plus a DM per employee.

## Goals

- Group chat with all employees + one DM per employee, in a UI matching Grok Bot's look (dark, avatar blobs, colored role labels, mention pills, pill composer).
- Employees have persistent memory per conversation (Agent SDK session resume).
- Employees can do real work in a workspace folder (developer has Read/Edit/Bash; manager is read-only).
- Zero API keys: the SDK spawns Claude Code, which uses the owner's login.

## Non-goals (v1)

Creating employees from the UI, WhatsApp/Telegram bridges, Electron packaging, multi-user.

## Architecture

```
client (Vite + React 19)  --SSE-->  server (Express, tsx)  --query()-->  Claude Agent SDK  -->  Claude Code (subscription)
                          <--REST--                        <--stream--
team.json  (who works here)         data/conversations/*.json  (what was said)
```

### Server modules

- `team.ts` — loads and validates `team.json`. Agent = `{ id, name, role, color, model, effort, personality, tools, permissionMode, cwd? }`.
- `store.ts` — conversations on disk, one JSON per conversation. Seeds the group + DMs from the team on first run. Also stores the per-agent session id inside each conversation.
- `agent.ts` — `runAgentTurn(agent, conversation)`: builds the turn prompt (messages since this agent's last turn, in transcript form) and calls `query()` with `resume`/`sessionId`, `systemPrompt` (persona + chat protocol), `allowedTools`, `permissionMode`, `cwd`, `model`, `effort`, `includePartialMessages`. Emits streaming text deltas and tool activity to the bus.
- `orchestrator.ts` — turn-taking per conversation, one round at a time:
  1. Owner's message mentions employees → only those reply, in mention order. Otherwise every member replies, in team order, each seeing earlier replies.
  2. After each reply, `@NAME` mentions of other members are appended to the queue (an employee can be re-queued at most once per round).
  3. Hard cap: 6 employee messages per owner message. A round can be aborted (Stop button).
  4. Owner messages sent during a round are queued and start the next round.
- `events.ts` — in-process event bus fanned out to SSE clients.
- `index.ts` — REST (`GET /api/state`, `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/stop`, `GET /api/events`) and static serving of the built client.

### Client

Single page: sidebar (search, conversations with avatar clusters and last message), chat view (header, messages grouped by author with role labels, streaming bubbles, tool-activity line, typing indicator), composer (mention autocomplete on `@`, Enter to send, Stop while a round runs).

### Data

```ts
interface Message { id; conversationId; authorId; text; createdAt; status: 'streaming'|'done'|'error'; activity?: string[] }
interface Conversation { id; kind: 'group'|'dm'; name; memberIds: string[]; messages: Message[]; sessions: Record<agentId, sessionId> }
```

### Error handling

An agent turn that throws or returns `is_error` becomes an error-status message with the reason, the round continues with the next agent. Aborting closes the SDK query. SSE reconnects automatically and the client refetches state on reconnect.

### Testing

Manual end-to-end against real agents (the point is the subscription path). Pure logic (mention parsing, queue building, prompt building) has unit tests via `node --test`.
