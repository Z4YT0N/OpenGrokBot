import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Attachment } from '../shared/types.js'

const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', md: 'text/markdown', txt: 'text/plain', json: 'application/json', csv: 'text/csv', yml: 'text/yaml', yaml: 'text/yaml', toml: 'text/plain', xml: 'application/xml',
  ts: 'text/typescript', tsx: 'text/typescript', js: 'text/javascript', jsx: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', css: 'text/css', py: 'text/x-python', sh: 'text/x-shellscript', ps1: 'text/plain', sql: 'text/x-sql', go: 'text/x-go', rs: 'text/x-rust', java: 'text/x-java', php: 'text/x-php', rb: 'text/x-ruby',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint', zip: 'application/zip',
}

const EXT = Object.keys(MIME).join('|')
/** Absolute Windows or POSIX paths ending in a known extension; spaces allowed inside. */
const PATH_RE = new RegExp(String.raw`(?:[A-Za-z]:[\\/]|/(?:home|Users|tmp|var|opt|srv|mnt|workspace)/)[^\x60"'<>|*?\n\r]+?\.(?:${EXT})(?![\w./\\])`, 'gi')

export function mimeOf(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

/**
 * Files an employee shared in a message: every absolute path in the text or in the tool
 * activity ("Write <path>") that exists and is allowed. Order of first appearance, max 8.
 */
export function collectAttachments(text: string, activity: string[], allowed: (p: string) => boolean): Attachment[] {
  const candidates: string[] = []
  const push = (p: string): void => {
    const clean = p.trim().replace(/[.,;:!?)\]]+$/, '')
    if (clean && !candidates.some((c) => c.toLowerCase() === clean.toLowerCase())) candidates.push(clean)
  }
  for (const line of activity) {
    const m = /^(?:Write|Edit)\s+(.+)$/.exec(line)
    if (m?.[1]) push(m[1])
  }
  let m: RegExpExecArray | null
  PATH_RE.lastIndex = 0
  while ((m = PATH_RE.exec(text)) !== null) push(m[0])
  const out: Attachment[] = []
  for (const p of candidates) {
    if (out.length >= 8) break
    if (!allowed(p) || !existsSync(p)) continue
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    out.push({ name: path.basename(p), path: p, mime: mimeOf(p), size: st.size })
  }
  return out
}
