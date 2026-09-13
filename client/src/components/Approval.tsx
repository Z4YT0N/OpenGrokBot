import { useState } from 'react'
import type { ApprovalRequest, Team } from '../../../shared/types'
import { resolveApproval } from '../api'
import { personFor } from '../people'
import { Avatar } from './Avatar'

interface ApprovalProps {
  team: Team
  request: ApprovalRequest
}

/** A tool call waiting for the owner: Allow once / Always allow this tool / Deny. */
export function ApprovalCard({ team, request }: ApprovalProps) {
  const [busy, setBusy] = useState(false)
  const p = personFor(team, request.agentId)
  const act = async (allow: boolean, always = false) => {
    setBusy(true)
    try {
      await resolveApproval(request.id, allow, always)
    } finally {
      setBusy(false)
    }
  }
  const input = JSON.stringify(request.input, null, 1)
  return (
    <div className="approval">
      <div className="approval-head">
        <Avatar person={p} size={22} />
        <span>
          <strong>{p.name}</strong> wants to run <code>{request.tool}</code>
        </span>
      </div>
      <div className="approval-summary" dir="auto">
        {request.summary || input.slice(0, 300)}
      </div>
      {request.summary && input.length > request.summary.length + 20 && (
        <details className="approval-details">
          <summary>Full input</summary>
          <pre>{input.slice(0, 4000)}</pre>
        </details>
      )}
      <div className="approval-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(true)}>
          Allow once
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void act(true, true)} title={`Adds an auto-review rule: always allow ${request.tool}`}>
          Always allow {request.tool}
        </button>
        <button type="button" className="btn btn-danger-ghost" disabled={busy} onClick={() => void act(false)}>
          Deny
        </button>
      </div>
    </div>
  )
}
