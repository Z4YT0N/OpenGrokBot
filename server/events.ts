import type { ServerEvent } from '../shared/types.js'

type Listener = (event: ServerEvent) => void

const listeners = new Set<Listener>()

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emit(event: ServerEvent): void {
  for (const l of listeners) {
    try {
      l(event)
    } catch {
      // a broken subscriber must not break the round
    }
  }
}
