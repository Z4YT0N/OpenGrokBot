# OpenGrokBot

**Your own AI company in a group chat.** Employees with personas, roles and real tools who reply to you *and to each other*, running on the subscriptions you already pay for: Claude (Claude Code login), ChatGPT (Codex CLI login), Google (Gemini CLI login), or any OpenAI-compatible API (Kimi, OpenRouter, DeepSeek, Groq, xAI Grok, Ollama…).

It is the part of xAI/Cursor's *Grok Bot* people actually loved, the "my team is arguing about my product" feeling, without the closed backend, the trial that ends, or the "upgrade to Pro" wall. Open source, local, yours.

![Group chat](docs/screenshots/group-chat.png)

```
You:    يا جماعة، عايز نعمل landing page جديدة لخدمة الـ ERP. @LAYLA و @NOUR ابدأوا
LAYLA:  تمام يا @Mahmoud، هبدأ بس محتاجة أعرف كام حاجة الأول…
NOUR:   متفقة مع @LAYLA في الأسئلة… بس عندي كام نقطة من ناحية الديزاين
KARIM:  بصراحة يا @LAYLA، إحنا لسه ماقفلناش deal ERP مع مصنع سعودي…
OMAR:   › Bash rg --files -g '*.ts'   › Read system/DEPLOY.md
        الـ outage بتاع النهارده…
```

## Why people like it

- **A team, not a chatbot.** A manager, a full-stack dev, DevOps, ops, backend, sales, QA, growth, design and product ship in the box. Each has a personality, a color, an avatar shape and a department badge. Add, duplicate, mute or delete anyone in two clicks.
- **They talk to each other.** Mention someone (`@OMAR`) and only they answer. Post something general and everyone weighs in, in order, each seeing the earlier replies. When an employee mentions a colleague, the colleague answers. Rounds are capped so nobody loops forever, and an employee with nothing to add stays quiet.
- **They do real work.** Employees run Claude Code / Codex / Gemini tools in your workspace: read repos, grep, edit files, run commands, search the web. You see the tool activity live under their message. Permissions and working folder are per employee.
- **Bring your own subscription.** No API keys required. Claude Code, Codex CLI and Gemini CLI use their own logins. Every employee picks a provider and model in their profile, so your manager can be Opus, your dev can be Codex, and your intern can be a free local Ollama model.
- **MCP marketplace.** GitHub, Playwright (a real browser), Filesystem, Postgres, Supabase, Slack, Notion, Context7, Vercel, Chrome DevTools… one click each, enabled per employee. Or point an employee at your whole `~/.claude` setup.
- **Usage and limits.** Tokens and API-equivalent cost per message, per conversation, per employee, per model and in total. Your Claude subscription's limit windows (5-hour, weekly, Opus weekly) with reset times.
- **Group chats, DMs, pins, export.** Extra group chats with any subset of the team, DMs with each employee, pin, rename, clear, export to Markdown, desktop notifications, Arabic RTL, Grok Bot-style dark UI.

| Providers | Usage | Marketplace |
|---|---|---|
| ![Providers](docs/screenshots/providers.png) | ![Usage](docs/screenshots/usage.png) | ![Marketplace](docs/screenshots/marketplace.png) |

## Install

Requirements: Node 20+ and at least one of these signed in on your machine:

| Provider | How it signs in | Install |
|---|---|---|
| Claude (Anthropic) | `claude` CLI, your Claude Pro/Max login | `npm i -g @anthropic-ai/claude-code` then `claude` |
| Codex (OpenAI) | `codex login`, your ChatGPT/Codex subscription | `npm i -g @openai/codex` then `codex login` |
| Gemini (Google) | `gemini` once, your Google account (same as Antigravity) | `npm i -g @google/gemini-cli` then `gemini` |
| Any API | An API key you paste in Settings → Providers | Nothing to install |

```bash
git clone https://github.com/Z4YT0N/OpenGrokBot
cd OpenGrokBot
npm install
npm run build
npm run desktop        # desktop window (Electron)
# or:  npm start       # then open http://127.0.0.1:4310
```

First start copies `team.example.json` to `team.json`. Open Settings → General to set your name, company and workspace folder, then say hi to the team.

> Windows note: if `node_modules/electron/dist` has no `electron.exe` after install, unzip the cached `electron-v*-win32-x64.zip` from `%LOCALAPPDATA%\electron\Cache\<hash>\` into that folder and write `electron.exe` into `node_modules/electron/path.txt`. The `npm run desktop` launcher also strips `ELECTRON_RUN_AS_NODE`, which VS Code terminals export.

## How providers work

| | Claude | Codex | Gemini | API |
|---|---|---|---|---|
| Runs through | Claude Agent SDK (Claude Code) | `codex exec --json` | `gemini --output-format json` | `POST /chat/completions` |
| Billing | Subscription login, or API key if you add one | ChatGPT subscription, or `OPENAI_API_KEY` | Google account, or `GEMINI_API_KEY` | Your key |
| Memory | Resumable session per employee per chat | Resumable thread per employee per chat | Recent transcript each turn | Recent transcript each turn |
| Tools | Read/Edit/Bash/Glob/Grep/WebSearch/WebFetch/subagents + MCP | Codex's own tools; sandbox follows the employee's tools | Gemini's own tools; approval mode follows the employee's tools | Built-in local tools: read/list/search/edit/write files, run commands, fetch URLs |
| Effort | ✅ | ✅ (`model_reasoning_effort`) | ignored | ignored |

Prompts go to the CLIs over stdin, never as arguments, so Arabic and other non-ASCII text survive Windows shells.

Nothing is sent anywhere except to the provider you chose. API keys live in `team.json` on your disk (git-ignored) and are never returned to the browser.

## Settings

- **General:** company, your name, workspace, group reply mode (everyone / mentions only), reply language (auto / Egyptian Arabic / English), notifications, round caps.
- **Team:** every employee; click to edit name, role, label, color, shape, provider, model, effort, personality, tools, permissions, working folder, MCP servers, auto-approve, mute.
- **Providers:** status of each CLI login, API keys, and any number of OpenAI-compatible providers with presets (Kimi, xAI, OpenRouter, DeepSeek, Groq, OpenAI, Mistral, Ollama).
- **Marketplace:** one-click MCP servers or a custom stdio/HTTP/SSE server.
- **Usage:** totals, by employee, by conversation, by model.
- **Claude account:** login type, Claude Code version, limit windows, refresh.

Right-click any chat for Pin, Rename/Edit chat, Edit profile, Mute, Duplicate, Export as Markdown, Clear, Delete.

## `team.json`

Everything the UI edits lives here. Safe to edit by hand; restart afterwards.

| field | meaning |
|---|---|
| `agents[].provider` | Key into `providers` (`claude`, `codex`, `gemini`, or one you added). |
| `agents[].model`, `effort` | Model id for that provider (`default` = the CLI's own default) and `low` … `max`. |
| `agents[].tools`, `permissionMode`, `cwd`, `autoApproveTools` | What the employee may do and where. |
| `agents[].mcpServers`, `inheritClaudeSettings` | Claude only: team MCP servers to enable, and whether to load your `~/.claude` setup. |
| `agents[].muted` | Only speaks in groups when mentioned. |
| `providers` | `{ kind, label, apiKey?, baseUrl?, models? }`. Built-ins `claude`, `codex`, `gemini` always exist. |
| `settings` | `groupMode`, `language`, `notifications`, `maxMessagesPerRound`, `maxTurnsPerAgentPerRound`, `maxTurnsPerReply`. |

Conversations are JSON files under `data/conversations/`.

## Layout

```
server/            Express + SSE, orchestrator, usage + account tracking, team/provider editing API
server/providers/  claude.ts (Agent SDK), codex.ts, gemini.ts, openai.ts (+ local tools), cli.ts
client/            Vite + React UI (chat, profile panel, settings, marketplace, providers)
shared/            Types and catalogs shared by both
desktop/           Electron shell + launcher
team.example.json  The starter company
```

`npm run dev` for hot reload (server :4310, client :5180). `npm test` for the unit tests.

## Name

OpenGrokBot = the open version of the Grok Bot idea: your team of AI employees, on whatever subscription or API you already have. Not affiliated with xAI, Cursor, or Oracle's unrelated OpenGrok code-search engine.

## License

MIT. Built by [Mahmoud Amr](https://github.com/Z4YT0N) at FortuneCode, with Claude.
