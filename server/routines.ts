import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { nextRun, parseCron } from './cron.js'
import { emit } from './events.js'
import type { Routine, RoutineRun } from '../shared/types.js'

export type RoutineRunner = (routine: Routine) => Promise<{ messageId?: string }>

/** Scheduled and webhook-triggered jobs. Persisted in data/routines.json; checked every 20s. */
export class Routines {
  private readonly file: string
  private routines: Routine[] = []
  private timer: NodeJS.Timeout | null = null
  private readonly running = new Set<string>()

  constructor(
    dataDir: string,
    private readonly run: RoutineRunner,
  ) {
    mkdirSync(dataDir, { recursive: true })
    this.file = path.join(dataDir, 'routines.json')
    if (existsSync(this.file)) {
      try {
        this.routines = JSON.parse(readFileSync(this.file, 'utf8')) as Routine[]
      } catch {
        this.routines = []
      }
    }
    for (const r of this.routines) this.reschedule(r)
    this.flush()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), 20_000)
  }

  list(): Routine[] {
    return this.routines
  }

  get(id: string): Routine | undefined {
    return this.routines.find((r) => r.id === id)
  }

  upsert(input: Omit<Routine, 'runs' | 'createdAt' | 'nextRunAt' | 'lastRunAt'> & Partial<Pick<Routine, 'runs' | 'createdAt'>>): Routine {
    if (input.cron.trim()) parseCron(input.cron)
    const existing = this.get(input.id)
    const routine: Routine = existing
      ? { ...existing, ...input, cron: input.cron.trim() }
      : { ...input, cron: input.cron.trim(), createdAt: Date.now(), runs: [] }
    this.reschedule(routine)
    if (existing) this.routines = this.routines.map((r) => (r.id === routine.id ? routine : r))
    else this.routines.push(routine)
    this.flush()
    return routine
  }

  delete(id: string): boolean {
    const before = this.routines.length
    this.routines = this.routines.filter((r) => r.id !== id)
    this.flush()
    return this.routines.length !== before
  }

  /** Run now (manual "Run" / "Test" button or webhook), optionally with extra text. */
  async trigger(id: string, extra?: string): Promise<RoutineRun | undefined> {
    const r = this.get(id)
    if (!r) return undefined
    return this.execute(r, extra)
  }

  private reschedule(r: Routine): void {
    if (r.enabled && r.cron) {
      const n = nextRun(r.cron)
      if (n) r.nextRunAt = n.getTime()
      else delete r.nextRunAt
    } else {
      delete r.nextRunAt
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now()
    for (const r of this.routines) {
      if (!r.enabled || !r.nextRunAt || r.nextRunAt > now || this.running.has(r.id)) continue
      await this.execute(r)
    }
  }

  private async execute(r: Routine, extra?: string): Promise<RoutineRun> {
    if (this.running.has(r.id)) {
      const skipped: RoutineRun = { at: Date.now(), status: 'skipped', durationMs: 0, error: 'already running' }
      return skipped
    }
    this.running.add(r.id)
    const started = Date.now()
    let run: RoutineRun
    try {
      const result = await this.run(extra ? { ...r, instruction: `${r.instruction}\n\n${extra}` } : r)
      run = { at: started, status: 'ok', durationMs: Date.now() - started, ...(result.messageId ? { messageId: result.messageId } : {}) }
    } catch (err) {
      run = { at: started, status: 'error', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.running.delete(r.id)
    }
    r.lastRunAt = started
    r.runs = [run, ...r.runs].slice(0, 20)
    this.reschedule(r)
    this.flush()
    return run
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.routines, null, 2))
    renameSync(tmp, this.file)
    emit({ type: 'routines', routines: this.routines })
  }
}
