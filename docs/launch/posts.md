# Launch kit

Copy-paste posts and the submission links. Post in this order over 3 days; each platform links back to the repo, which is what Google ranks.

## Day 1

### Hacker News (Show HN)
Submit: https://news.ycombinator.com/submit
Title: `Show HN: OpenGrokBot – open-source Grok Bot alternative on your Claude/ChatGPT/Gemini plan`
URL: `https://github.com/Z4YT0N/OpenGrokBot`
First comment (post right after submitting):

> I liked one thing about Grok Bot (xAI/Cursor's desktop agent app): a "company" of AI employees arguing in a group chat about my product, each with a role. Then my trial ended and it wanted Cursor Pro or SuperGrok, and the models were picked by their cloud.
>
> So I rebuilt that part as an open-source desktop app. Each employee is an agent with a persona, model and tools. It runs through the CLIs you already have signed in: Claude Code (Agent SDK), Codex CLI, Gemini CLI, or any OpenAI-compatible API (Kimi, OpenRouter, Ollama…). Employees mention each other and reply in rounds with caps so they never loop; they read repos, edit files, run commands; there's an MCP marketplace, usage/cost per employee, and your Claude limit windows.
>
> TypeScript, Express + SSE, React, Electron. ~5k lines. MIT. Happy to answer questions about the orchestration (who speaks when) which was the interesting part.

### Reddit
- r/ClaudeAI → https://www.reddit.com/r/ClaudeAI/submit
  Title: `I built an open-source Grok Bot alternative that runs on your Claude subscription (Agent SDK, no API key)`
- r/cursor → https://www.reddit.com/r/cursor/submit
  Title: `Grok Bot trial ended? Here's an open-source version that uses Claude/Codex/Gemini logins instead`
- r/LocalLLaMA → https://www.reddit.com/r/LocalLLaMA/submit
  Title: `OpenGrokBot: AI "employees" that debate in a group chat, works with Ollama and any OpenAI-compatible API`

Body (all three):

> Grok Bot (from xAI/Cursor) has one genuinely fun idea: a team of AI employees with roles that reply to you and to each other in a group chat. It's closed, cloud-only, Grok-only, and paywalled after the trial.
>
> OpenGrokBot is the open version: https://github.com/Z4YT0N/OpenGrokBot
>
> - Employees = agents with persona, provider, model, effort, tools, MCP servers
> - Providers: Claude Code (your Claude login), Codex CLI (ChatGPT login), Gemini CLI (Google login), or any OpenAI-compatible API incl. local Ollama
> - They mention each other, reply in capped rounds, stay silent when they have nothing to add
> - Real tools in your workspace, MCP marketplace, usage per employee, Claude limit windows
> - Electron desktop app or browser, MIT
>
> Screenshots in the README. Feedback welcome, especially on the turn-taking rules.

### X / Twitter
> Grok Bot's best idea was a company of AI employees arguing in a group chat. Its worst was the paywall.
>
> So I open-sourced it. OpenGrokBot runs on your Claude / ChatGPT / Gemini plan or any API, locally, MIT.
>
> github.com/Z4YT0N/OpenGrokBot
>
> [attach docs/screenshots/group-chat.png]

Arabic version:
> بديل Grok Bot مفتوح المصدر: شركة كاملة من موظفين AI بيتناقشوا مع بعض في جروب شات، بيشتغل باشتراك Claude أو ChatGPT أو Gemini اللي عندك أصلًا أو أي API، وبيرد بالعربي المصري.
> github.com/Z4YT0N/OpenGrokBot

## Day 2

### Alternative directories (these rank for "X alternative" searches)
- opensourcealternatives.to → submit: https://www.opensourcealternatives.to/submit (Buzz is already listed there as a "Grok Bot alternative"; ask to be listed under Grok Bot too)
- AlternativeTo → https://alternativeto.net/software/grok-bot/ → "Suggest an alternative" (needs a free account)
- OpenAlternative → https://openalternative.co/submit
- Product Hunt → https://www.producthunt.com/posts/new (tagline: "Open-source Grok Bot alternative: an AI company in a group chat")
- awesome-claude-code → open a PR adding OpenGrokBot under agents/apps: https://github.com/hesreallyhim/awesome-claude-code
- awesome-mcp-clients → https://github.com/punkpeye/awesome-mcp-clients (it is an MCP client)

### Dev.to / Hashnode article
Title: `I rebuilt Grok Bot as an open-source app that runs on the AI subscription you already have`
Outline: what Grok Bot got right → why I couldn't keep using it → the architecture (Agent SDK, codex exec --json, prompt over stdin, orchestration rules, per-employee sessions) → what's next. Link the repo three times. Add the comparison table from the README.

## Day 3
- Reply to every comment; commit fixes people report the same day (activity boosts GitHub ranking).
- Add a short GIF of a round to the top of the README.
- Cross-post the article to LinkedIn with the GIF.

## SEO notes (already done in the repo)
- Repo description, topics (`grok-bot`, `grok-bot-alternative`, `open-source-alternative`…), homepage link
- README H1 + first paragraph target "Grok Bot alternative", comparison table, FAQ in question form, Arabic section
- GitHub Pages landing page with title/description/OG/Twitter cards, SoftwareApplication + FAQPage JSON-LD, canonical URL
- Social preview image at docs/social.png (upload once in repo Settings → Social preview; GitHub has no API for it)
