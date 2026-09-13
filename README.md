# Fortune Office

A company-style chat where AI employees talk to you **and to each other**, running on your Claude subscription. Think Grok Bot's "colleagues debating in a group" feel, but every employee is Claude, with a persona, memory per conversation, and real tools in your workspace.

```
You:    Hello guys, tell me what employees else we need?
KHALED: Love the ambition, but I'd push back on hiring before we have the work… @OMAR
OMAR:   I mostly agree with Khaled's order. Hire #1 should be a mid-level full-stack dev…
KHALED: @OMAR I agree on mid-level over junior…
```

## How it runs on the subscription

The server uses `@anthropic-ai/claude-agent-sdk`, which spawns Claude Code. Claude Code uses whatever login you already have (`claude` CLI signed in with your Pro/Max account). No API key is needed, and any `ANTHROPIC_API_KEY` in your environment is deliberately ignored so you are never billed per token by accident.

Requirements: Node 20+, Claude Code installed and signed in (`claude --version` works).

## Run

```bash
npm install
npm run dev        # server on :4310 + Vite client on :5180 (open http://localhost:5180)
```

Production build (served by the server itself):

```bash
npm run build
npm start          # open http://127.0.0.1:4310
```

Desktop window (Electron):

```bash
npm run build
npm run desktop
```

## Your team: `team.json`

Every employee is one entry. Edit the file and restart.

| field | meaning |
|---|---|
| `name`, `role`, `color` | Shown in the chat (label is `NAME \| ROLE`). Mention with `@NAME`. |
| `personality` | The persona. Written in second person ("You are …"). |
| `model` | `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, … |
| `effort` | `low` … `max`. Controls how hard the model thinks. |
| `tools` | Claude Code tools the employee may use: `Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`. Empty = chat only. |
| `permissionMode` | `dontAsk` (only listed tools, never prompts), `acceptEdits` (file edits auto-approved), `plan`, `default`. |
| `cwd` | Working directory for tools. Defaults to `workspace`. |

## How turns work

- In the group, mention someone (`@OMAR`) and only they reply. Say something general and every employee replies in order, each seeing the earlier replies.
- When an employee mentions a colleague, the colleague replies. An employee speaks at most twice per round and a round is capped at six employee messages, so they never loop forever. Press the stop button to cut a round short.
- An employee who has nothing to add stays silent (they answer `[skip]` internally).
- Each employee keeps an Agent SDK session per conversation, so they remember what was said without the whole history being resent.

Conversations live in `data/conversations/*.json`. Delete a file to reset that chat.

## Layout

```
server/        Express + SSE, the orchestrator, the Agent SDK runner
client/        Vite + React UI
shared/        Types shared by both
desktop/       Electron shell
team.json      Who works here
```

Tests: `npm test`.
