/** Per-viewer read markers, kept in localStorage (a convenience, not shared state). */

const KEY = 'ogb.lastRead'

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function save(map: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // storage may be unavailable
  }
}

export function lastRead(conversationId: string): number {
  return load()[conversationId] ?? 0
}

export function markRead(conversationId: string, at = Date.now()): void {
  const map = load()
  map[conversationId] = at
  save(map)
}

export function markUnread(conversationId: string): void {
  const map = load()
  map[conversationId] = 0
  save(map)
}
