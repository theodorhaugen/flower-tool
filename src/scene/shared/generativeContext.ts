import { createContext, useContext } from 'react'
import type { GenerativeState } from './generative'
import type { ColorPalette } from './palette'

/**
 * Split from GenerativeProvider.tsx so that file only exports the
 * component (needed for fast-refresh) — the context object and hooks are
 * plain logic, not JSX, same split as shared/instancing.ts vs
 * InstancedGroup.tsx.
 */
export const GenerativeContext = createContext<GenerativeState | null>(null)

/** The active render's full generative state — throws if used outside `<GenerativeProvider>` so a missing provider fails loudly, not with silent defaults. */
export function useGenerative(): GenerativeState {
  const state = useContext(GenerativeContext)
  if (!state) {
    throw new Error('useGenerative() called outside <GenerativeProvider>')
  }
  return state
}

/** Convenience selector for the common case of a subsystem only caring about colour — most consumers (flowers, environment, lighting, effects) reach for just this. */
export function usePalette(): ColorPalette {
  return useGenerative().palette
}
