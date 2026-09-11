import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites from /<repo-name>/, not the domain
  // root — asset URLs break without this since Vite otherwise assumes /.
  base: '/flower-tool/',
  plugins: [react()],
})
