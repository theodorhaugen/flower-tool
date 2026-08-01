import { useEffect, useMemo } from 'react'
import { DynamicRangeMeterPass } from './DynamicRangeMeterPass'

/**
 * R3F wrapper — constructs DynamicRangeMeterPass once. Unlike every other
 * wrapper in this file's family, it takes no palette/generative-state props:
 * it measures the actual rendered pixels every frame rather than deriving
 * anything from creative state, so there's nothing here for a seed or Leva
 * control to feed in.
 */
export function DynamicRangeMeter() {
  const pass = useMemo(() => new DynamicRangeMeterPass(), [])

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
