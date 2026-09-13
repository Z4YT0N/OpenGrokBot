# Contributing to OpenGrokBot

Thanks for helping. This project is small enough to read in an afternoon, and every part of it is fair game.

## Quick start

```bash
git clone https://github.com/Z4YT0N/OpenGrokBot
cd OpenGrokBot
npm install
npm run dev          # server :4310 + client :5180 with hot reload
npm test             # unit tests (node --test)
npm run typecheck    # both tsconfigs
```

You need at least one provider signed in to actually talk to employees (`claude`, `codex login`, `gemini`, or an API key in Settings → Providers). The UI, orchestrator and store can be worked on without any provider by reading `data/conversations/*.json`.

## Where things live

| Area | Files |
|---|---|
| Turn-taking (who speaks when) | `server/orchestrator.ts`, `server/mentions.ts` |
| Prompts employees see | `server/prompt.ts` |
| Providers | `server/providers/*.ts` (one file per provider, `index.ts` dispatches) |
| Local tools for API providers | `server/providers/localtools.ts` |
| Persistence | `server/store.ts` (conversations), `server/team.ts` (team.json), `server/account.ts` |
| HTTP + SSE | `server/index.ts`, `server/events.ts` |
| UI | `client/src/components/*` (Chat, Sidebar, Composer, Profile, Settings, Providers, NewChat) |
| Catalogs (models, tools, presets, marketplace) | `shared/catalog.ts`, `client/src/marketplace.ts` |

## Good contributions

Look at issues labeled `good first issue` and `help wanted`. Some ideas:

- New marketplace MCP entries or API presets (one object in a catalog file).
- A new provider (copy `server/providers/gemini.ts`, register it in `index.ts`, add it to `PROVIDER_KINDS`).
- Light theme, keyboard shortcuts, message search, reply-to.
- Bridges: WhatsApp, Telegram, Slack, Discord (post a message → round → replies back).
- Packaged installers (electron-builder) for Windows/macOS/Linux.
- Translations of the UI.

## Rules of the road

- TypeScript strict everywhere. `npm run typecheck` and `npm test` must pass; CI runs both on every PR.
- Keep files focused. If a component or module grows past ~300 lines, split it.
- No new runtime dependencies without a reason in the PR description.
- Never send prompts to a CLI as command-line arguments (they get mangled on Windows for non-ASCII text); use stdin as in `server/providers/cli.ts`.
- API keys never leave the server. Anything that returns `team` to the browser must go through `publicTeam()`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.

## Pull requests

1. Fork, branch from `main`.
2. Make the change with a test when there is logic to test (see `server/orchestrator.test.ts`).
3. Run `npm run typecheck && npm test && npm run build`.
4. Open the PR with what/why and a screenshot for UI changes.

## Reporting bugs

Use the bug template. Include your OS, Node version, which provider the employee used, and the relevant lines from the terminal where the server runs.

## Code of conduct

Be kind. See `CODE_OF_CONDUCT.md`.
