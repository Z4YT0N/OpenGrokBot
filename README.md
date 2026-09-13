# Fortune Office

A company-style chat where AI employees talk to you **and to each other**, running on your Claude subscription. Think Grok Bot's "colleagues debating in a group" feel, but every employee is Claude, with a persona, memory per conversation, real tools in your workspace, MCP servers, and a full settings page with usage and limit monitoring.

```
You:    يا جماعة، عايز نعمل landing page جديدة لخدمة الـ ERP. @LAYLA و @NOUR ابدأوا
LAYLA:  تمام يا @Mahmoud، هبدأ بس محتاجة أعرف كام حاجة الأول…
NOUR:   متفقة مع @LAYLA في الأسئلة… بس عندي كام نقطة من ناحية الديزاين
KARIM:  بصراحة يا @LAYLA، إحنا لسه ماقفلناش deal ERP مع مصنع سعودي…
```

## How it runs on the subscription

The server uses `@anthropic-ai/claude-agent-sdk`, which spawns Claude Code. Claude Code uses whatever login you already have (`claude` CLI signed in with your Pro/Max account). No API key is needed, and any `ANTHROPIC_API_KEY` in your environment is deliberately ignored so you are never billed per token by accident. Settings → Claude account shows how it authenticated and your limit windows.

Requirements: Node 20+, Claude Code installed and signed in (`claude --version` works).

## Run

```bash
npm install
npm run build
npm run desktop    # Electron window (starts the server itself)
```

Or in the browser:

```bash
npm run dev        # server on :4310 + Vite client on :5180 (open http://localhost:5180)
npm start          # serve the built client from :4310
```

The desktop launcher strips `ELECTRON_RUN_AS_NODE`, which VS Code terminals export. If `node_modules/electron/dist` has no `electron.exe` after install, unzip the cached `electron-v*-win32-x64.zip` from `%LOCALAPPDATA%\electron\Cache\<hash>\` into that folder and write `electron.exe` into `node_modules/electron/path.txt`.

## Features

- **Group chat + a DM per employee**, Grok Bot-style UI: avatar shapes and colors, colored role labels, department badges, mention pills, `+N` clusters, typing indicators, streaming replies, tool-activity lines, Arabic RTL.
- **Employees talk to each other.** Mention someone (`@OMAR`) and only they reply; say something general and everyone replies in order, each seeing earlier replies; an employee who mentions a colleague gets an answer. Rounds are capped (configurable) and an employee with nothing to add stays silent.
- **Real work.** Employees get Claude Code tools (Read/Edit/Bash/Glob/Grep/WebSearch/WebFetch/subagents) in a working folder, with a permission mode per employee. The dev actually opens repos and edits code.
- **MCP servers.** Settings → Marketplace adds GitHub, Playwright, Filesystem, Postgres, Supabase, Slack, Notion, Context7, Vercel, Chrome DevTools and more with one click (or any custom stdio/HTTP server). Enable each per employee in their profile. An employee can also inherit your own `~/.claude` setup (MCP servers, plugins, skills, CLAUDE.md).
- **Edit everything from the UI.** Click a member (or right-click a DM → Edit profile): name, role, label, color, shape, model, effort, personality, tools, permissions, working folder, MCP servers, auto-approve. Add or delete employees. Changes are saved to `team.json` live.
- **Usage monitor.** Tokens and API-equivalent cost per message (hover), per conversation (header), per employee (members panel and Settings → Usage), per model, and in total. Silent turns are counted too.
- **Claude account.** Settings → Claude account shows the login type, Claude Code version, and the subscription limit windows (5-hour, weekly, weekly Opus…) with reset times; "Check now" refreshes with a one-word Haiku turn.
- **Memory.** Each employee keeps an Agent SDK session per conversation, so they remember what was said without the history being resent.
- **Language.** Employees answer in the language you write: Egyptian Arabic when you write Arabic, technical terms in English.

## `team.json`

Everything the UI edits lives here (safe to edit by hand too, restart after).

| field | meaning |
|---|---|
| `name`, `role`, `color`, `shape` | Shown in the chat (label is `NAME \| ROLE`). Mention with `@NAME`. Shapes: `blob`, `round`, `triangle`, `hex`, `drop`. |
| `department` | Small badge next to the name in the sidebar. |
| `personality` | The persona, second person ("You are …"). |
| `model`, `effort` | `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, … and `low` … `max`. |
| `tools` | Claude Code tools the employee may use. Empty = chat only. |
| `permissionMode` | `dontAsk`, `acceptEdits`, `default`, `plan`, `bypassPermissions`. |
| `cwd` | Working directory for tools. Defaults to `workspace`. |
| `mcpServers` | Names from the team-level `mcpServers` map this employee can use. |
| `inheritClaudeSettings` | Load your own Claude Code user settings for this employee. |
| `autoApproveTools` | Approve every tool call (including MCP) without prompting. |
| `settings` | `maxMessagesPerRound`, `maxTurnsPerAgentPerRound`, `maxTurnsPerReply`. |

Conversations live in `data/conversations/*.json`; right-click a chat → Clear conversation, or delete the file.

## Layout

```
server/        Express + SSE, orchestrator, Agent SDK runner, usage + account tracking, team editing API
client/        Vite + React UI (chat, profile panel, settings modal, marketplace)
shared/        Types and catalogs shared by both
desktop/       Electron shell + launcher
team.json      Who works here
```

Tests: `npm test`.
