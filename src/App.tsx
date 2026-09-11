import { Leva } from 'leva'
import { CapturedView } from './CapturedView'
import { Experience } from './scene/Experience'

function App() {
  return (
    <>
      <Leva titleBar={{ title: 'Flower Field' }} collapsed />
      <CapturedView>
        <Experience />
      </CapturedView>
    </>
  )
}

export default App
