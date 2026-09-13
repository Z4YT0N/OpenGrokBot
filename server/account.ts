import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { AccountStatus, RateLimitType, RateLimitWindow } from '../shared/types.js'

export interface RateLimitReport {
  status: 'allowed' | 'allowed_warning' | 'rejected'
  rateLimitType?: RateLimitType | undefined
  utilization?: number | undefined
  resetsAt?: number | undefined
}

/** Last known subscription limits, as reported by Claude Code during employee turns. */
export class Account {
  private status: AccountStatus = { windows: {} }

  constructor(private readonly file: string) {
    if (existsSync(file)) {
      try {
        this.status = JSON.parse(readFileSync(file, 'utf8')) as AccountStatus
      } catch {
        this.status = { windows: {} }
      }
    }
  }

  get(): AccountStatus {
    return this.status
  }

  noteInit(authSource: string, version: string): boolean {
    const changed = this.status.authSource !== authSource || this.status.claudeCodeVersion !== version
    this.status.authSource = authSource
    this.status.claudeCodeVersion = version
    if (changed) this.flush()
    return changed
  }

  noteRateLimit(info: RateLimitReport): void {
    const type = info.rateLimitType ?? 'five_hour'
    const w: RateLimitWindow = { type, status: info.status, updatedAt: Date.now() }
    if (typeof info.utilization === 'number') w.utilization = info.utilization
    if (typeof info.resetsAt === 'number') w.resetsAt = info.resetsAt
    this.status.windows[type] = w
    this.status.updatedAt = w.updatedAt
    this.flush()
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.status, null, 2))
    renameSync(tmp, this.file)
  }
}
