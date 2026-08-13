import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: ['index.html', 'privacy.html'],
    },
  },
  plugins: [react()],
})
