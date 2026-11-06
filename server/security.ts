import { realpathSync } from 'node:fs'
import path from 'node:path'
import { isIP } from 'node:net'
import type { Request } from 'express'

/** Reject symlinks traversing outside the approved trees. For nonexistent writes, check the real parent. */
export function insideRoots(candidate: string, roots: string[], forWrite = false): boolean {
  try {
    const actual = realpathSync(forWrite ? path.dirname(candidate) : candidate)
    const compare = (p: string): string => process.platform === 'win32' ? p.toLowerCase() : p
    return roots.some((root) => {
      const base = realpathSync(root)
      const relative = path.relative(compare(base), compare(actual))
      return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    })
  } catch {
    return false
  }
}

/** Hostname allowlisting is deliberate: generic web fetches must not reach internal services. */
export function safeFetchUrl(value: string): URL {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported web URL')
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.home.arpa') || isIP(host) || !host.includes('.')) throw new Error('Local and IP-literal web targets are not allowed')
  return url
}

/** Reject foreign browser origins for state-changing requests, including localhost mode. */
export function trustedRequestOrigin(req: Pick<Request, 'headers' | 'get'>): boolean {
  const origin = req.get('origin')
  const destination = req.get('host')
  if (!origin) {
    // Browsers send Origin on mutating fetches. Non-browser bearer clients may omit it.
    return !req.get('sec-fetch-site') || req.get('sec-fetch-site') === 'none'
  }
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.host === destination) return true
    // Vite development proxy rewrites Host to :4310; only permit the local dev UI.
    return destination === '127.0.0.1:4310' && url.hostname === '127.0.0.1' && url.port === '5180'
  } catch {
    return false
  }
}
