import { CinematicFrame } from './scene/CinematicFrame'
import { Experience } from './scene/Experience'
import { SceneCanvas } from './scene/SceneCanvas'

function App() {
  return (
    <CinematicFrame>
      <SceneCanvas>
        <Experience />
      </SceneCanvas>
    </CinematicFrame>
  )
}

export default App
