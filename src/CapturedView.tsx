import type { ReactNode } from 'react'
import { SceneCanvas } from './scene/SceneCanvas'
import { useCaptureState } from './scene/shared/captureStore'

interface CapturedViewProps {
  children: ReactNode
}

/**
 * What the user actually sees: one captured still image, not a live 3D
 * viewport — see scene/shared/captureStore.ts and
 * scene/shared/SettleDriver.tsx for where that image comes from and when
 * it updates. The real WebGL canvas (`children`, the Experience scene)
 * keeps running underneath, fully hidden (`opacity: 0`, `pointerEvents:
 * 'none'`, but still laid out at full size so captures come out the
 * right resolution) — it exists purely to *generate* the next still,
 * never to be looked at directly.
 *
 * `isGenerating` layers a label over whatever was captured last rather
 * than blanking the screen, so regenerating on a parameter tweak reads as
 * "updating this image" rather than "starting over from nothing." It also
 * drives the hidden canvas's `frameloop` prop directly (`"always"` while
 * generating, `"demand"` once settled) — see SceneCanvas.tsx's docstring
 * for why that has to be a prop here rather than an imperative call from
 * inside the tree.
 */
export function CapturedView({ children }: CapturedViewProps) {
  const { imageUrl, isGenerating } = useCaptureState()

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0a0908' }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Generated flower field"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {isGenerating && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            padding: '6px 12px',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#eee',
            fontFamily: 'monospace',
            fontSize: 12,
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          Generating…
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}>
        <SceneCanvas frameloop={isGenerating ? 'always' : 'demand'}>{children}</SceneCanvas>
      </div>
    </div>
  )
}
