import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // Mana shu qatorni qo'shing
  build: {
    outDir: 'dist'
  }
})
