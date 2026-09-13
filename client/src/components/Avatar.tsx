import type { AvatarShape } from '../../../shared/types'
import type { Person } from '../people'

interface AvatarProps {
  person: Person
  size?: number
}

const SHAPES: Record<AvatarShape, string> = {
  blob: 'M5 21C4 12 11 5 20 5s16 6 15 15c-1 8-6 15-15 15S6 30 5 21z',
  round: 'M20 4a16 16 0 1 1 0 32 16 16 0 0 1 0-32z',
  triangle: 'M18 5c1.2-1.5 2.8-1.5 4 0l13 24c1 2-.2 4.5-2.5 4.5h-25C5.2 33.5 4 31 5 29z',
  hex: 'M17.5 4.5c1.5-.9 3.5-.9 5 0l9.5 5.5c1.5.9 2.5 2.6 2.5 4.3v11.4c0 1.7-1 3.4-2.5 4.3L22.5 35.5c-1.5.9-3.5.9-5 0L8 30c-1.5-.9-2.5-2.6-2.5-4.3V14.3c0-1.7 1-3.4 2.5-4.3z',
  drop: 'M20 3c6 8 14 14 14 22a14 14 0 0 1-28 0C6 17 14 11 20 3z',
}

/** A friendly face in the employee's color and shape; the owner gets an initial on a gradient. */
export function Avatar({ person, size = 36 }: AvatarProps) {
  if (person.kind === 'owner') {
    const initial = person.name.trim().charAt(0).toUpperCase() || '•'
    return (
      <span className="avatar avatar-owner" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-label={person.name}>
        {initial}
      </span>
    )
  }
  const shape = person.agent?.shape ?? 'blob'
  const eyeY = shape === 'triangle' ? 23 : shape === 'drop' ? 23 : 19.5
  const mouthY = eyeY + 7.5
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 40 40" aria-label={person.name}>
      <path d={SHAPES[shape]} fill={person.color} />
      <ellipse cx="14.5" cy={eyeY} rx="2.3" ry="2.6" fill="#141414" />
      <ellipse cx="25.5" cy={eyeY} rx="2.3" ry="2.6" fill="#141414" />
      <path d={`M15.5 ${mouthY}c2.5 2.2 6.5 2.2 9 0`} stroke="#141414" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

interface AvatarClusterProps {
  people: Person[]
  size?: number
}

/** Overlapping avatars like a group-chat icon: up to three faces, then "+N". */
export function AvatarCluster({ people, size = 40 }: AvatarClusterProps) {
  const shown = people.slice(0, 3)
  const rest = people.length - shown.length
  if (shown.length === 1 && shown[0]) return <Avatar person={shown[0]} size={size} />
  const small = Math.round(size * 0.72)
  const step = Math.round(size * 0.3)
  const width = small + step * (shown.length - 1)
  return (
    <span className="avatar-cluster-wrap">
      <span className="avatar-cluster" style={{ width, height: size }}>
        {shown.map((p, i) => (
          <span key={p.id} className="avatar-cluster-item" style={{ left: i * step, zIndex: shown.length - i }}>
            <Avatar person={p} size={small} />
          </span>
        ))}
      </span>
      {rest > 0 && <span className="avatar-cluster-more">+{rest}</span>}
    </span>
  )
}
