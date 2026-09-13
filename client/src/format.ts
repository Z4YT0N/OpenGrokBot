export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function formatRelative(ts: number): string {
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const unit = abs < 3_600_000 ? ['minute', 60_000] as const : abs < 86_400_000 ? ['hour', 3_600_000] as const : ['day', 86_400_000] as const
  const n = Math.round(abs / unit[1])
  const word = `${n} ${unit[0]}${n === 1 ? '' : 's'}`
  return diff > 0 ? `in ${word}` : `${word} ago`
}

export function modelLabel(id: string): string {
  return id
    .replace(/^claude-/, '')
    .replace(/-(\d)-(\d)$/, ' $1.$2')
    .replace(/-(\d)$/, ' $1')
    .replace(/^(\w)/, (c) => c.toUpperCase())
}
