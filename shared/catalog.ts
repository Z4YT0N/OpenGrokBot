import type { AvatarShape, Effort, PermissionMode, ProviderDef, ProviderKind, RateLimitType } from './types.js'

export const MODELS: { id: string; label: string; hint: string }[] = [
  { id: 'claude-opus-5', label: 'Opus 5', hint: 'Smartest. Best for the manager, developers and anything hard.' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', hint: 'Previous Opus generation.' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'Fast and strong. Good default for most roles.' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: 'Previous Sonnet generation.' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', hint: 'Cheapest and quickest. Chat-only roles.' },
]

/** Suggested model ids per provider kind (free text is always allowed). */
export const MODEL_SUGGESTIONS: Record<ProviderKind, string[]> = {
  claude: MODELS.map((m) => m.id),
  codex: ['default', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
  gemini: ['default', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  openai: [],
}

export const PROVIDER_KINDS: { id: ProviderKind; label: string; hint: string }[] = [
  { id: 'claude', label: 'Claude Code', hint: 'Anthropic. Uses your Claude subscription login, or an API key if you add one. Full tools + MCP.' },
  { id: 'codex', label: 'Codex CLI', hint: 'OpenAI. Uses your ChatGPT / Codex subscription login (`codex login`). Full coding tools.' },
  { id: 'gemini', label: 'Gemini CLI', hint: 'Google. Signs in with your Google account, the same one Antigravity uses. Full coding tools.' },
  { id: 'openai', label: 'API (OpenAI-compatible)', hint: 'Any chat API: Kimi, OpenRouter, DeepSeek, Groq, xAI Grok, Ollama… Chat plus built-in file/shell tools.' },
]

/** Built-in defaults that always exist in team.providers. */
export const DEFAULT_PROVIDERS: Record<string, ProviderDef> = {
  claude: { kind: 'claude', label: 'Claude (subscription)' },
  codex: { kind: 'codex', label: 'Codex (ChatGPT subscription)' },
  gemini: { kind: 'gemini', label: 'Gemini (Google account)' },
}

/** One-click presets for OpenAI-compatible APIs. */
export const API_PRESETS: { id: string; label: string; baseUrl: string; models: string[]; keyHint: string }[] = [
  { id: 'kimi', label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.ai/v1', models: ['kimi-k2-thinking', 'kimi-k2-0905-preview', 'kimi-k2-turbo-preview'], keyHint: 'platform.moonshot.ai → API keys' },
  { id: 'xai', label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', models: ['grok-4', 'grok-4-fast', 'grok-code-fast-1'], keyHint: 'console.x.ai' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro', 'moonshotai/kimi-k2'], keyHint: 'openrouter.ai/keys' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], keyHint: 'platform.deepseek.com' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct'], keyHint: 'console.groq.com' },
  { id: 'openai', label: 'OpenAI API', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'], keyHint: 'platform.openai.com' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'codestral-latest'], keyHint: 'console.mistral.ai' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434/v1', models: ['qwen3:32b', 'llama3.3', 'deepseek-r1:32b'], keyHint: 'No key needed (type anything)' },
]

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
]

export const TOOLS: { id: string; label: string; hint: string; kinds: ProviderKind[] }[] = [
  { id: 'Read', label: 'Read', hint: 'Read files', kinds: ['claude', 'codex', 'gemini', 'openai'] },
  { id: 'Glob', label: 'Glob', hint: 'Find files by pattern', kinds: ['claude', 'codex', 'gemini', 'openai'] },
  { id: 'Grep', label: 'Grep', hint: 'Search file contents', kinds: ['claude', 'codex', 'gemini', 'openai'] },
  { id: 'Edit', label: 'Edit', hint: 'Edit files', kinds: ['claude', 'codex', 'gemini', 'openai'] },
  { id: 'Write', label: 'Write', hint: 'Create files', kinds: ['claude', 'codex', 'gemini', 'openai'] },
  { id: 'Bash', label: 'Bash', hint: 'Run shell commands', kinds: ['claude', 'codex', 'gemini', 'openai'] },
  { id: 'WebSearch', label: 'Web search', hint: 'Search the web', kinds: ['claude', 'codex', 'gemini'] },
  { id: 'WebFetch', label: 'Web fetch', hint: 'Read web pages', kinds: ['claude', 'openai'] },
  { id: 'Task', label: 'Subagents', hint: 'Spawn Claude Code subagents for big jobs', kinds: ['claude'] },
  { id: 'NotebookEdit', label: 'Notebooks', hint: 'Edit Jupyter notebooks', kinds: ['claude'] },
]

export const PERMISSION_MODES: { id: PermissionMode; label: string; hint: string }[] = [
  { id: 'dontAsk', label: "Don't ask", hint: 'Only the listed tools run; anything else is denied.' },
  { id: 'acceptEdits', label: 'Accept edits', hint: 'File edits in the workspace are approved automatically.' },
  { id: 'default', label: 'Default', hint: 'Claude Code defaults; unlisted tools are denied.' },
  { id: 'plan', label: 'Plan only', hint: 'Read-only exploration, no changes.' },
  { id: 'bypassPermissions', label: 'Bypass all', hint: 'Everything allowed. Use with care.' },
]

export const SHAPES: AvatarShape[] = ['blob', 'round', 'triangle', 'hex', 'drop']

export const RATE_LIMIT_LABELS: Record<RateLimitType, string> = {
  five_hour: '5-hour window',
  seven_day: 'Weekly (all models)',
  seven_day_opus: 'Weekly (Opus)',
  seven_day_sonnet: 'Weekly (Sonnet)',
  seven_day_overage_included: 'Weekly incl. overage',
  overage: 'Overage credits',
}
