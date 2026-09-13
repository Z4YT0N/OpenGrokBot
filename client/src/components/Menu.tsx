import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

interface MenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** A small context menu anchored at a screen position. */
export function Menu({ x, y, items, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const left = Math.min(x, window.innerWidth - 240)
  const top = Math.min(y, window.innerHeight - items.length * 40 - 20)
  return (
    <div ref={ref} className="menu" style={{ left, top }} role="menu">
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <div className="menu-divider" />}
          <button
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? ' is-danger' : ''}`}
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
