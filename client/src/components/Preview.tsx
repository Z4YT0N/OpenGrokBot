import { useState } from 'react'
import type { Attachment } from '../../../shared/types'
import { fileUrl, openFile } from '../api'

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i
const HTML = /\.html?$/i
const PDF = /\.pdf$/i

/** Absolute paths of produced files mentioned in a message (same detector as the text chips). */
export function producedFiles(text: string): string[] {
  const re = /(?:[A-Za-z]:[\\/]|\/(?:home|Users|tmp|var|opt|srv)\/)[^`"'<>|*?\n]+?\.(?:html?|png|jpe?g|gif|webp|svg|pdf)(?![\w./\\])/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) if (!out.includes(m[0])) out.push(m[0])
  return out.slice(0, 4)
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Inline preview card for an image, an HTML page (sandboxed), or a PDF, with Open. */
export function PreviewCard({ path }: { path: string }) {
  const [expanded, setExpanded] = useState(false)
  const url = fileUrl(path)
  const open = () => void openFile(path).catch(() => window.open(url, '_blank'))
  return (
    <div className={`preview${expanded ? ' is-expanded' : ''}`}>
      <div className="preview-body" onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0}>
        {IMAGE.test(path) && <img src={url} alt={nameOf(path)} loading="lazy" />}
        {HTML.test(path) && <iframe src={url} title={nameOf(path)} sandbox="allow-same-origin" loading="lazy" />}
        {PDF.test(path) && <iframe src={url} title={nameOf(path)} loading="lazy" />}
      </div>
      <div className="preview-foot">
        <span className="preview-name" title={path}>
          {nameOf(path)}
        </span>
        <button type="button" className="btn btn-pill" onClick={open}>
          Open
        </button>
      </div>
    </div>
  )
}

/** Attachments the owner sent: image thumbnails or file chips. */
export function AttachmentList({ items }: { items: Attachment[] }) {
  return (
    <div className="attachments">
      {items.map((a) => (
        <button key={a.path} type="button" className="attachment" title={a.path} onClick={() => void openFile(a.path).catch(() => window.open(fileUrl(a.path), '_blank'))}>
          {a.mime.startsWith('image/') ? <img src={fileUrl(a.path)} alt={a.name} /> : <span className="attachment-icon">📎</span>}
          <span className="attachment-name">{a.name}</span>
        </button>
      ))}
    </div>
  )
}
