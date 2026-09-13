/** Minimal 5-field cron (minute hour day-of-month month day-of-week) in local time. */

interface Field {
  any: boolean
  values: Set<number>
}

function parseField(spec: string, min: number, max: number, names?: Record<string, number>): Field {
  if (spec === '*') return { any: true, values: new Set() }
  const values = new Set<number>()
  for (const part of spec.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart ? Number(stepPart) : 1
    if (!Number.isFinite(step) || step < 1) throw new Error(`bad step in "${part}"`)
    let lo = min
    let hi = max
    if (rangePart !== '*' && rangePart !== undefined && rangePart !== '') {
      const [a, b] = rangePart.split('-')
      const parse = (s: string | undefined): number => {
        if (s === undefined) throw new Error(`bad range in "${part}"`)
        const key = s.toLowerCase().slice(0, 3)
        const n = names && key in names ? names[key] : Number(s)
        if (n === undefined || !Number.isFinite(n)) throw new Error(`bad value "${s}"`)
        return n
      }
      lo = parse(a)
      hi = b !== undefined ? parse(b) : stepPart ? max : lo
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`out of range in "${part}"`)
    for (let v = lo; v <= hi; v += step) values.add(v)
  }
  return { any: false, values }
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

export interface CronSpec {
  minute: Field
  hour: Field
  dom: Field
  month: Field
  dow: Field
}

export function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('cron needs 5 fields: minute hour day month weekday')
  const [m, h, d, mo, w] = parts as [string, string, string, string, string]
  const dow = parseField(w.replace(/7/g, '0'), 0, 6, DAYS)
  return { minute: parseField(m, 0, 59), hour: parseField(h, 0, 23), dom: parseField(d, 1, 31), month: parseField(mo, 1, 12, MONTHS), dow }
}

function matches(spec: CronSpec, t: Date): boolean {
  const ok = (f: Field, v: number): boolean => f.any || f.values.has(v)
  if (!ok(spec.minute, t.getMinutes()) || !ok(spec.hour, t.getHours()) || !ok(spec.month, t.getMonth() + 1)) return false
  // Standard cron: when both day fields are restricted, either may match.
  const domOk = ok(spec.dom, t.getDate())
  const dowOk = ok(spec.dow, t.getDay())
  if (!spec.dom.any && !spec.dow.any) return domOk || dowOk
  return domOk && dowOk
}

/** Next run strictly after `from`, or null if none within two years. */
export function nextRun(expr: string, from = new Date()): Date | null {
  const spec = parseCron(expr)
  const t = new Date(from)
  t.setSeconds(0, 0)
  t.setMinutes(t.getMinutes() + 1)
  const limit = from.getTime() + 2 * 366 * 86_400_000
  while (t.getTime() < limit) {
    if (matches(spec, t)) return new Date(t)
    t.setMinutes(t.getMinutes() + 1)
  }
  return null
}

/** Human presets for the UI: label → cron. */
export const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every day at 08:00', cron: '0 8 * * *' },
  { label: 'Every day at 18:00', cron: '0 18 * * *' },
  { label: 'Weekdays at 09:00 (Sun–Thu)', cron: '0 9 * * 0-4' },
  { label: 'Every Monday at 10:00', cron: '0 10 * * 1' },
  { label: 'First of the month at 09:00', cron: '0 9 1 * *' },
]
