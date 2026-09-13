import { useEffect, useState } from 'react'
import type { Attachment, Team } from '../../../shared/types'
import { fileUrl, openFile } from '../api'
import { formatTokens } from '../format'
import { RichText } from './RichText'

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'html' | 'markdown' | 'text' | 'office' | 'other'

const TEXT_EXT = /\.(txt|json|csv|ya?ml|toml|xml|ts|tsx|js|jsx|mjs|cjs|css|py|sh|ps1|sql|go|rs|java|php|rb|log|env|ini|conf)$/i

export function kindOf(a: Attachment): Kind {
  const m = a.mime.toLowerCase()
  const n = a.name.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (m === 'text/html' || /\.html?$/.test(n)) return 'html'
  if (m === 'text/markdown' || n.endsWith('.md')) return 'markdown'
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || TEXT_EXT.test(n)) return 'text'
  if (/\.(docx?|xlsx?|pptx?|odt|ods)$/i.test(n) || m.includes('officedocument') || m.includes('msword') || m.includes('ms-excel') || m.includes('ms-powerpoint')) return 'office'
  return 'other'
}

const ICON: Record<Kind, string> = { image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', html: '🌐', markdown: '📝', text: '📄', office: '📊', other: '📎' }

function officeIcon(name: string): string {
  if (/\.xlsx?$|\.ods$|\.csv$/i.test(name)) return '📊'
  if (/\.pptx?$/i.test(name)) return '📽️'
  return '📘'
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Legacy path detection for messages saved before attachments existed. */
export function producedFiles(text: string): string[] {
  const re = /(?:[A-Za-z]:[\\/]|\/(?:home|Users|tmp|var|opt|srv)\/)[^`"'<>|*?\n]+?\.(?:html?|png|jpe?g|gif|webp|svg|pdf)(?![\w./\\])/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) if (!out.includes(m[0])) out.push(m[0])
  return out.slice(0, 4)
}

export function attachmentFromPath(path: string): Attachment {
  const name = path.split(/[\\/]/).pop() ?? path
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const mime = ext === 'pdf' ? 'application/pdf' : /^html?$/.test(ext) ? 'text/html' : /^(png|jpe?g|gif|webp|svg)$/.test(ext) ? `image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext}` : 'application/octet-stream'
  return { name, path, mime, size: 0 }
}

function TextBody({ a, expanded, team }: { a: Attachment; expanded: boolean; team?: Team }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(fileUrl(a.path))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => alive && setText(t))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [a.path])
  if (error) return <div className="file-text muted">Could not load the file.</div>
  if (text === null) return <div className="file-text muted">Loading…</div>
  const limit = expanded ? 60_000 : 2_000
  const shown = text.slice(0, limit)
  const more = text.length > limit
  const isMd = kindOf(a) === 'markdown'
  return (
    <div className={`file-text${isMd ? ' is-md' : ''}`} dir="auto">
      {isMd && team ? <RichText text={shown} team={team} /> : <pre>{shown}</pre>}
      {more && <div className="muted small">… {formatTokens(text.length - limit)} more characters. Click to expand or Open.</div>}
    </div>
  )
}

/** One card for any file: inline preview by type, name, size, Open / Download. */
export function FileCard({ a, team }: { a: Attachment; team?: Team }) {
  const [expanded, setExpanded] = useState(false)
  const kind = kindOf(a)
  const url = fileUrl(a.path)
  const open = () => void openFile(a.path).catch(() => window.open(url, '_blank'))
  const download = () => window.open(`${url}&download=1`, '_blank')
  const previewable = kind !== 'office' && kind !== 'other'
  return (
    <div className={`file-card is-${kind}${expanded ? ' is-expanded' : ''}`}>
      {previewable && (
        <div className="file-body" onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0} title={expanded ? 'Collapse' : 'Expand'}>
          {kind === 'image' && <img src={url} alt={a.name} loading="lazy" />}
          {kind === 'video' && <video src={url} controls preload="metadata" onClick={(e) => e.stopPropagation()} />}
          {kind === 'audio' && <audio src={url} controls preload="metadata" onClick={(e) => e.stopPropagation()} />}
          {kind === 'pdf' && <iframe src={url} title={a.name} loading="lazy" />}
          {kind === 'html' && <iframe src={url} title={a.name} sandbox="allow-same-origin" loading="lazy" />}
          {(kind === 'text' || kind === 'markdown') && <TextBody a={a} expanded={expanded} {...(team ? { team } : {})} />}
        </div>
      )}
      <div className="file-foot">
        <span className="file-icon">{kind === 'office' ? officeIcon(a.name) : ICON[kind]}</span>
        <span className="file-name" title={a.path}>
          {a.name}
          {a.size > 0 && <span className="muted"> · {sizeLabel(a.size)}</span>}
        </span>
        <button type="button" className="btn btn-pill" onClick={open}>
          Open
        </button>
        <button type="button" className="icon-button" onClick={download} aria-label="Download" title="Download">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** A row of file cards. */
export function AttachmentList({ items, team }: { items: Attachment[]; team?: Team }) {
  return (
    <div className="file-cards">
      {items.map((a) => (
        <FileCard key={a.path} a={a} {...(team ? { team } : {})} />
      ))}
    </div>
  )
}
