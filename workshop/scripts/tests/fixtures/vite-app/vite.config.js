import { defineConfig } from 'vite'

// The automatic JSX runtime, without pulling in the full React plugin: this
// fixture only ever runs `vite build` / `vite preview` in the harness.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
})
