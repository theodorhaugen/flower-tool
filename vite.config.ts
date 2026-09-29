import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites from /<repo-name>/, not the domain
  // root — asset URLs break without this since Vite otherwise assumes /.
  // Vercel serves from the domain root instead, so it needs the opposite;
  // `VERCEL` is set automatically in every Vercel build environment (no
  // project-side config needed), which is what this branches on.
  base: process.env.VERCEL ? '/' : '/flower-tool/',
  plugins: [react()],
})
