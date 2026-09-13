import type { AvatarShape, Effort, PermissionMode, RateLimitType } from './types.js'

export const MODELS: { id: string; label: string; hint: string }[] = [
  { id: 'claude-opus-5', label: 'Opus 5', hint: 'Smartest. Best for the manager, developers and anything hard.' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', hint: 'Previous Opus generation.' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'Fast and strong. Good default for most roles.' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: 'Previous Sonnet generation.' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', hint: 'Cheapest and quickest. Chat-only roles.' },
]

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
]

export const TOOLS: { id: string; label: string; hint: string }[] = [
  { id: 'Read', label: 'Read', hint: 'Read files' },
  { id: 'Glob', label: 'Glob', hint: 'Find files by pattern' },
  { id: 'Grep', label: 'Grep', hint: 'Search file contents' },
  { id: 'Edit', label: 'Edit', hint: 'Edit files' },
  { id: 'Write', label: 'Write', hint: 'Create files' },
  { id: 'Bash', label: 'Bash', hint: 'Run shell commands' },
  { id: 'WebSearch', label: 'Web search', hint: 'Search the web' },
  { id: 'WebFetch', label: 'Web fetch', hint: 'Read web pages' },
  { id: 'Task', label: 'Subagents', hint: 'Spawn Claude Code subagents for big jobs' },
  { id: 'NotebookEdit', label: 'Notebooks', hint: 'Edit Jupyter notebooks' },
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
