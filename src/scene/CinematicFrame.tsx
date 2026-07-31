import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CAMERA_CONFIG } from './camera/config'

function computeFrameSize(aspect: number): { width: number; height: number } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let width = viewportWidth
  let height = viewportWidth / aspect
  if (height > viewportHeight) {
    height = viewportHeight
    width = viewportHeight * aspect
  }

  return { width, height }
}

interface CinematicFrameProps {
  children: ReactNode
}

/** Letterboxes the scene to a fixed cinematic aspect ratio, independent of the browser window's actual shape. */
export function CinematicFrame({ children }: CinematicFrameProps) {
  const [size, setSize] = useState(() => computeFrameSize(CAMERA_CONFIG.cinematicAspect))

  useEffect(() => {
    const handleResize = () => setSize(computeFrameSize(CAMERA_CONFIG.cinematicAspect))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
      }}
    >
      <div style={{ position: 'relative', width: size.width, height: size.height }}>{children}</div>
    </div>
  )
}
