import type { Person } from '../people'

interface AvatarProps {
  person: Person
  size?: number
}

/** A friendly blob face in the employee's color; the owner gets an initial on a gradient. */
export function Avatar({ person, size = 36 }: AvatarProps) {
  if (person.kind === 'owner') {
    const initial = person.name.trim().charAt(0).toUpperCase() || '•'
    return (
      <span
        className="avatar avatar-owner"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        aria-label={person.name}
      >
        {initial}
      </span>
    )
  }
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 40 40" aria-label={person.name}>
      <path
        d="M5 21C4 12 11 5 20 5s16 6 15 15c-1 8-6 15-15 15S6 30 5 21z"
        fill={person.color}
      />
      <ellipse cx="14.5" cy="19.5" rx="2.3" ry="2.6" fill="#141414" />
      <ellipse cx="25.5" cy="19.5" rx="2.3" ry="2.6" fill="#141414" />
      <path d="M15.5 27c2.5 2.2 6.5 2.2 9 0" stroke="#141414" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

interface AvatarClusterProps {
  people: Person[]
  size?: number
}

/** Overlapping avatars like a group-chat icon. Shows at most three. */
export function AvatarCluster({ people, size = 40 }: AvatarClusterProps) {
  const shown = people.slice(0, 3)
  if (shown.length === 1 && shown[0]) return <Avatar person={shown[0]} size={size} />
  const small = Math.round(size * 0.72)
  const step = Math.round(size * 0.3)
  return (
    <span className="avatar-cluster" style={{ width: size + step * (shown.length - 1) * 0.8, height: size }}>
      {shown.map((p, i) => (
        <span key={p.id} className="avatar-cluster-item" style={{ left: i * step, zIndex: shown.length - i }}>
          <Avatar person={p} size={small} />
        </span>
      ))}
    </span>
  )
}
