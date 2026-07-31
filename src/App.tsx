import { Leva } from 'leva'
import { Experience } from './scene/Experience'
import { SceneCanvas } from './scene/SceneCanvas'

function App() {
  return (
    <>
      <Leva titleBar={{ title: 'Flower Field' }} collapsed />
      <SceneCanvas>
        <Experience />
      </SceneCanvas>
    </>
  )
}

export default App
